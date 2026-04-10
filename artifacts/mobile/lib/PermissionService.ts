/**
 * PermissionService — handles Android Special Access permissions that cannot
 * be requested via the standard expo-permissions API:
 *   • PACKAGE_USAGE_STATS  (Usage Access — detect foreground app)
 *   • SYSTEM_ALERT_WINDOW  (Overlay — draw the lock screen over other apps)
 *
 * These are "Special Access" settings on Android; the OS requires the user
 * to grant them manually from a dedicated settings page.  We open those pages
 * via expo-intent-launcher and use AppState + AsyncStorage to track whether
 * the user returned after granting access.
 *
 * On iOS and web neither permission is relevant, so all checks return true.
 *
 * Required Supabase table (run once in the Supabase SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS focus_profiles (
 *     id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 *     streak_days INT DEFAULT 0,
 *     total_time_saved_minutes INT DEFAULT 0,
 *     wall_of_shame_total INT DEFAULT 0,
 *     weekly_data JSONB DEFAULT '[]'::jsonb,
 *     leaderboard_opt_in BOOLEAN DEFAULT false,
 *     global_rank INT,
 *     updated_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   ALTER TABLE focus_profiles ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "own_profile" ON focus_profiles FOR ALL USING (auth.uid() = id);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import { AppState, AppStateStatus, Platform } from 'react-native';

const STORAGE_KEY_USAGE = 'perm_usage_stats_granted';
const STORAGE_KEY_OVERLAY = 'perm_overlay_granted';

const ANDROID_PACKAGE = 'com.focusguard.app';

const INTENT_USAGE_ACCESS = 'android.settings.USAGE_ACCESS_SETTINGS';
const INTENT_OVERLAY = 'android.settings.action.MANAGE_OVERLAY_PERMISSION';

export type PermissionStatus = 'unknown' | 'granted' | 'denied';

/**
 * Returns true if the app is running on Android.
 * On iOS / web we treat both permissions as pre-granted.
 */
function isAndroid() {
  return Platform.OS === 'android';
}

/**
 * Check whether the Usage Stats permission was previously marked as granted.
 *
 * NOTE: The UsageStatsManager API is not exposed to JavaScript in Expo Go.
 *       In a custom development build or production APK the native module
 *       could call AppOpsManager to get the real state.  Here we persist the
 *       user's confirmed grant in AsyncStorage, which is reset only on a fresh
 *       install.
 */
export async function checkUsagePermission(): Promise<boolean> {
  if (!isAndroid()) return true;
  const value = await AsyncStorage.getItem(STORAGE_KEY_USAGE);
  return value === 'true';
}

/**
 * Check whether the Overlay (SYSTEM_ALERT_WINDOW) permission is granted.
 *
 * Strategy (Android only):
 *   1. Try the real native bridge — Settings.canDrawOverlays() via the
 *      @focusguard/app-tracking NativeModule.  This is accurate in any
 *      custom development build or production APK.
 *   2. Fall back to the AsyncStorage flag for environments where the native
 *      module is unavailable (Expo Go, web).
 */
export async function checkOverlayPermission(): Promise<boolean> {
  if (!isAndroid()) return true;

  let nativeModuleUnavailable = false;

  try {
    const { hasOverlayPermission } = require('@focusguard/app-tracking');
    const result: boolean = await hasOverlayPermission();
    // Keep AsyncStorage in sync so other callers stay consistent.
    if (result) {
      AsyncStorage.setItem(STORAGE_KEY_OVERLAY, 'true').catch(() => {});
    }
    return result;
  } catch (err: unknown) {
    // Only fall back to AsyncStorage when the module is unavailable
    // (Expo Go, web, or missing native module).  Re-throw any other error
    // so callers are not silently mis-informed by stale storage state.
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Cannot find module') ||
      msg.includes('Invariant Violation') ||
      msg.includes('TurboModuleRegistry') ||
      msg.includes('requireNativeModule') ||
      msg.includes('undefined is not an object')
    ) {
      nativeModuleUnavailable = true;
    } else {
      throw err;
    }
  }

  if (nativeModuleUnavailable) {
    const value = await AsyncStorage.getItem(STORAGE_KEY_OVERLAY);
    return value === 'true';
  }

  return false;
}

/**
 * Open the Usage Access settings page.
 * Falls back to the generic system Settings app if the intent is unavailable.
 */
export async function openUsageAccessSettings(): Promise<void> {
  if (!isAndroid()) return;
  try {
    await IntentLauncher.startActivityAsync(INTENT_USAGE_ACCESS);
  } catch {
    try {
      await Linking.openSettings();
    } catch {}
  }
}

/**
 * Open the "Display over other apps" settings page, scoped to FocusGuard.
 * Falls back to the generic system Settings app if the intent is unavailable.
 */
export async function openOverlaySettings(): Promise<void> {
  if (!isAndroid()) return;
  try {
    await IntentLauncher.startActivityAsync(INTENT_OVERLAY, {
      data: `package:${ANDROID_PACKAGE}`,
    });
  } catch {
    try {
      await Linking.openSettings();
    } catch {}
  }
}

/**
 * Persist that the Usage Stats permission was granted.
 * Call this after detecting the user returned from the settings page.
 */
export async function markUsageGranted(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_USAGE, 'true');
}

/**
 * Persist that the Overlay permission was granted.
 * Call this after detecting the user returned from the settings page.
 */
export async function markOverlayGranted(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_OVERLAY, 'true');
}

/**
 * Revoke stored permission grants (useful for testing / re-onboarding).
 */
export async function revokeStoredPermissions(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY_USAGE, STORAGE_KEY_OVERLAY]);
}

/**
 * Subscribe to AppState changes and invoke `onActive` once each time the
 * app returns to the foreground.  Returns an unsubscribe function.
 *
 * Usage:
 *   const unsub = subscribeToAppForeground(() => recheckPermissions());
 *   // later:
 *   unsub();
 */
export function subscribeToAppForeground(onActive: () => void): () => void {
  let previousState: AppStateStatus = AppState.currentState;

  const subscription = AppState.addEventListener('change', (nextState) => {
    if (previousState !== 'active' && nextState === 'active') {
      onActive();
    }
    previousState = nextState;
  });

  return () => subscription.remove();
}
