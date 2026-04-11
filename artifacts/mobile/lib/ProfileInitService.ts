/**
 * ProfileInitService
 *
 * Runs once after the user grants both required Android permissions.
 *
 * Responsibilities:
 *   1. Fetch the first batch of device usage data (last 24 h).
 *   2. Write the profile row to Supabase:
 *        • New user  → INSERT with all default fields + permissions_verified=true
 *        • Returning → UPDATE only permission flags + merge weekly_data
 *   3. Write an initial app-config map to @focusguard_app_configs_v2 in
 *      AsyncStorage (if none exists yet).
 *
 * checkPermissionsAlreadyVerified():
 *   Called on every cold-start so returning users skip the permission gate
 *   if Supabase already has permissions_verified = true for their account.
 *
 * Required SQL (run once in Supabase SQL Editor):
 *
 *   ALTER TABLE focus_profiles
 *     ADD COLUMN IF NOT EXISTS permissions_verified     BOOLEAN DEFAULT false,
 *     ADD COLUMN IF NOT EXISTS initial_setup_complete   BOOLEAN DEFAULT false;
 *
 * Required RLS policies on focus_profiles (all use auth.uid() = id):
 *   SELECT  — USING (auth.uid() = id)
 *   INSERT  — WITH CHECK (auth.uid() = id)
 *   UPDATE  — USING (auth.uid() = id)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { queryLast24hStats } from './UsageStatsService';
import { getInstalledApps } from '@/modules/app-tracking';

const APP_CONFIGS_KEY = '@focusguard_app_configs_v2';

export interface InitResult {
  success: boolean;
  error?: string;
}

/**
 * Fetch device data and write / update the user's Supabase focus_profile.
 *
 * Strategy:
 *   1. SELECT the existing row (maybeSingle — no error if absent).
 *   2a. If no row   → INSERT with all fields (new user).
 *   2b. If row exists → UPDATE only: permissions_verified, initial_setup_complete,
 *       updated_at, and a merged weekly_data (preserves existing data).
 *
 * Best-effort: a Supabase failure does not prevent the user entering the app.
 */
export async function initializeProfile(): Promise<InitResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not signed in' };
    }

    // ── 1. Fetch device data in parallel ──────────────────────────────────────
    const [statsResult, appsResult] = await Promise.allSettled([
      queryLast24hStats(),
      getInstalledApps(),
    ]);

    const usageStats  = statsResult.status  === 'fulfilled' ? statsResult.value  : [];
    const installedApps = appsResult.status === 'fulfilled' ? appsResult.value   : [];

    const totalMinutesToday = usageStats.reduce((sum, s) => sum + s.totalTimeMinutes, 0);
    const todayIndex = new Date().getDay(); // 0 = Sunday … 6 = Saturday
    const now = new Date().toISOString();

    // ── 2. Read existing profile row ──────────────────────────────────────────
    const { data: existing, error: selectError } = await supabase
      .from('focus_profiles')
      .select('weekly_data, streak_days, total_time_saved_minutes, wall_of_shame_total, leaderboard_opt_in')
      .eq('id', user.id)
      .maybeSingle();          // returns null (not an error) when no row exists

    if (selectError) {
      console.warn('[ProfileInit] SELECT error:', selectError.message);
      // Continue — we will attempt an upsert anyway
    }

    let supabaseError: string | null = null;

    if (!existing) {
      // ── 2a. New user — INSERT the full initial row ───────────────────────────
      const freshWeeklyData = Array(7).fill(0);
      freshWeeklyData[todayIndex] = totalMinutesToday;

      const { error } = await supabase.from('focus_profiles').insert({
        id:                     user.id,
        permissions_verified:   true,
        initial_setup_complete: true,
        streak_days:            0,
        total_time_saved_minutes: 0,
        wall_of_shame_total:    0,
        weekly_data:            freshWeeklyData,
        leaderboard_opt_in:     false,
        updated_at:             now,
      });

      if (error) {
        supabaseError = error.message;
        console.warn('[ProfileInit] INSERT error:', error.message);
      }
    } else {
      // ── 2b. Existing user — UPDATE permission flags + merge weekly_data ──────
      //
      // Merge strategy: keep the existing slot values; replace today's slot
      // with the freshly fetched device total (higher of the two).
      const existingWeekly: number[] =
        Array.isArray(existing.weekly_data) && existing.weekly_data.length === 7
          ? (existing.weekly_data as number[])
          : Array(7).fill(0);

      const mergedWeekly = [...existingWeekly];
      mergedWeekly[todayIndex] = Math.max(
        mergedWeekly[todayIndex] ?? 0,
        totalMinutesToday,
      );

      const { error } = await supabase
        .from('focus_profiles')
        .update({
          permissions_verified:   true,
          initial_setup_complete: true,
          weekly_data:            mergedWeekly,
          updated_at:             now,
        })
        .eq('id', user.id);

      if (error) {
        supabaseError = error.message;
        console.warn('[ProfileInit] UPDATE error:', error.message);
      }
    }

    // ── 3. Write default AsyncStorage app configs (once only) ─────────────────
    const existingConfigs = await AsyncStorage.getItem(APP_CONFIGS_KEY);
    if (!existingConfigs) {
      const userApps = installedApps.filter(a => !a.isSystemApp).slice(0, 30);
      const defaultConfigs: Record<string, { lockDuration: number; unlockDuration: number }> = {};
      for (const app of userApps) {
        defaultConfigs[app.packageName] = { lockDuration: 30, unlockDuration: 10 };
      }
      await AsyncStorage.setItem(APP_CONFIGS_KEY, JSON.stringify(defaultConfigs));
    }

    return supabaseError
      ? { success: false, error: supabaseError }
      : { success: true };

  } catch (err) {
    console.warn('[ProfileInit] initializeProfile error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Check Supabase to see if this account already verified permissions.
 * Returns true  → PermissionGate is skipped (returning verified user).
 * Returns false → gate is shown (new user, offline, or column not yet migrated).
 *
 * Uses maybeSingle() so a missing row is null, not an error.
 */
export async function checkPermissionsAlreadyVerified(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('focus_profiles')
      .select('permissions_verified')
      .eq('id', user.id)
      .maybeSingle();          // null when row absent — not an error

    if (error) {
      console.warn('[ProfileInit] checkPermissionsAlreadyVerified error:', error.message);
      return false;
    }

    return data?.permissions_verified === true;
  } catch {
    return false;
  }
}
