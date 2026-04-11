/**
 * ProfileInitService
 *
 * Runs once after the user grants both required Android permissions.
 *
 * Responsibilities:
 *   1. Fetch the first batch of device usage data (last 24 h).
 *   2. Upsert focus_profiles in Supabase:
 *        permissions_verified     = true
 *        initial_setup_complete   = true
 *        weekly_data              = today's usage totals
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
 * Fetch device data and mark the user's Supabase profile as fully initialised.
 * Called once after both permissions are confirmed granted.
 *
 * This is "best-effort" — a Supabase failure does not prevent the user from
 * entering the app, because local data is the primary source of truth.
 */
export async function initializeProfile(): Promise<InitResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not signed in' };
    }

    // Fetch device data in parallel — both calls are fire-and-forget safe
    const [statsResult, appsResult] = await Promise.allSettled([
      queryLast24hStats(),
      getInstalledApps(),
    ]);

    const usageStats = statsResult.status === 'fulfilled' ? statsResult.value : [];
    const installedApps = appsResult.status === 'fulfilled' ? appsResult.value : [];

    // Build weekly_data with today's slot populated
    const totalMinutesToday = usageStats.reduce((sum, s) => sum + s.totalTimeMinutes, 0);
    const weeklyData = Array(7).fill(0);
    weeklyData[new Date().getDay()] = totalMinutesToday; // 0 = Sunday

    // Upsert focus_profiles — permissions_verified + initial_setup_complete
    const { error: upsertError } = await supabase
      .from('focus_profiles')
      .upsert(
        {
          id: user.id,
          permissions_verified: true,
          initial_setup_complete: true,
          weekly_data: weeklyData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

    if (upsertError) {
      console.warn('[ProfileInit] Supabase upsert error:', upsertError.message);
      // Non-fatal — local device data still works without the cloud write
    }

    // Write default app configs if none exist yet
    const existingConfigs = await AsyncStorage.getItem(APP_CONFIGS_KEY);
    if (!existingConfigs) {
      const userApps = installedApps.filter(a => !a.isSystemApp).slice(0, 30);
      const defaultConfigs: Record<string, { lockDuration: number; unlockDuration: number }> = {};
      for (const app of userApps) {
        defaultConfigs[app.packageName] = { lockDuration: 30, unlockDuration: 10 };
      }
      await AsyncStorage.setItem(APP_CONFIGS_KEY, JSON.stringify(defaultConfigs));
    }

    return { success: true };
  } catch (err) {
    console.warn('[ProfileInit] initializeProfile error:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Check Supabase to see if this account already verified permissions on a
 * previous session.  If true, the PermissionGate is skipped entirely.
 *
 * Resolves to false on any error (network offline, unauthenticated, column
 * not yet added via migration) — the gate is shown and the user re-verifies.
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
      .single();

    if (error || !data) return false;
    return (data as any).permissions_verified === true;
  } catch {
    return false;
  }
}
