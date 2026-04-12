/**
 * ProfileInitService
 *
 * Initialises the user's Supabase focus_profile after the permission screens.
 *
 * initializeProfile():
 *   - Fires device data fetches (usage stats, installed apps) — empty results
 *     are fine, the Supabase write still happens.
 *   - Uses a single upsert (INSERT … ON CONFLICT DO UPDATE) so it works
 *     correctly for both new and returning users without a prior SELECT.
 *   - Always resolves { success: true } — never blocks the UI.
 *
 * checkPermissionsAlreadyVerified():
 *   - Called on cold-start; skips the gate if the account was verified before.
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
 * Write / update the user's focus_profile in Supabase.
 *
 * Uses a single upsert with ignoreDuplicates:false so Supabase runs:
 *   INSERT … ON CONFLICT (id) DO UPDATE SET …
 * This handles new users (INSERT) and returning users (UPDATE) in one call.
 *
 * Device data (usage stats, installed apps) is fetched optimistically —
 * if either returns an empty array the upsert still runs with zeros.
 * Always resolves { success: true } so it never blocks the UI.
 */
export async function initializeProfile(): Promise<InitResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[ProfileInit] No authenticated user — skipping');
      return { success: true };
    }

    // Fetch device data — failures are silent; empty arrays are fine
    const [statsResult, appsResult] = await Promise.allSettled([
      queryLast24hStats(),
      getInstalledApps(),
    ]);

    const usageStats   = statsResult.status  === 'fulfilled' ? statsResult.value : [];
    const installedApps = appsResult.status  === 'fulfilled' ? appsResult.value  : [];

    const totalMinutesToday = usageStats.reduce((s, x) => s + x.totalTimeMinutes, 0);
    const weeklyData = Array(7).fill(0);
    weeklyData[new Date().getDay()] = totalMinutesToday;

    // Single upsert — works for both new (INSERT) and existing (UPDATE) rows.
    // onConflict:'id' → ON CONFLICT (id) DO UPDATE SET …
    const { error } = await supabase.from('focus_profiles').upsert(
      {
        id:                       user.id,
        permissions_verified:     true,
        initial_setup_complete:   true,
        streak_days:              0,
        total_time_saved_minutes: 0,
        wall_of_shame_total:      0,
        weekly_data:              weeklyData,
        leaderboard_opt_in:       false,
        updated_at:               new Date().toISOString(),
      },
      {
        onConflict: 'id',
        // ignoreDuplicates:false (default) → DO UPDATE on conflict
      },
    );

    if (error) {
      console.warn('[ProfileInit] upsert error (non-fatal):', error.message);
    }

    // Write default AsyncStorage app configs if none exist yet
    const existingConfigs = await AsyncStorage.getItem(APP_CONFIGS_KEY);
    if (!existingConfigs) {
      const userApps = installedApps.filter(a => !a.isSystemApp).slice(0, 30);
      const defaultConfigs: Record<string, { lockDuration: number; unlockDuration: number }> = {};
      for (const app of userApps) {
        defaultConfigs[app.packageName] = { lockDuration: 30, unlockDuration: 10 };
      }
      await AsyncStorage.setItem(APP_CONFIGS_KEY, JSON.stringify(defaultConfigs));
    }
  } catch (err) {
    console.warn('[ProfileInit] initializeProfile error (non-fatal):', err);
  }

  // Always succeed — never block the UI
  return { success: true };
}

/**
 * Check Supabase to see if this account already verified permissions.
 * Returns true  → PermissionGate is skipped.
 * Returns false → gate is shown (new user, offline, or column not migrated).
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
      .maybeSingle();

    if (error) {
      console.warn('[ProfileInit] checkPermissionsAlreadyVerified error:', error.message);
      return false;
    }

    return data?.permissions_verified === true;
  } catch {
    return false;
  }
}
