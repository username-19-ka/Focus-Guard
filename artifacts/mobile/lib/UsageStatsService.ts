/**
 * UsageStatsService — bridges Android's UsageStatsManager into JavaScript.
 *
 * On Android (EAS production APK / development build) this calls the native
 * @brighthustle/react-native-usage-stats-manager module, which wraps:
 *   • UsageStatsManager.queryAndAggregateUsageStats()  → per-app 24-hour totals
 *   • UsageStatsManager.queryEvents()                  → foreground-app detection
 *   • AppOpsManager.checkOpNoThrow(OPSTR_GET_USAGE_STATS) → real permission check
 *
 * On iOS / web all functions return gracefully (mock data or null).
 * On Android, if the native module is not linked (Expo Go), the last 5-minute
 * AsyncStorage cache is returned, falling back to static mock data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface AppUsageStat {
  packageName: string;
  totalTimeInForegroundMs: number;
  totalTimeMinutes: number;
  lastTimeUsed: number;
}

const CACHE_KEY = 'usage_stats_cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

const MOCK_STATS: AppUsageStat[] = [
  { packageName: 'com.instagram.android', totalTimeInForegroundMs: 5_220_000, totalTimeMinutes: 87, lastTimeUsed: Date.now() - 300_000 },
  { packageName: 'com.zhiliaoapp.musically', totalTimeInForegroundMs: 2_700_000, totalTimeMinutes: 45, lastTimeUsed: Date.now() - 1_800_000 },
  { packageName: 'com.twitter.android', totalTimeInForegroundMs: 1_680_000, totalTimeMinutes: 28, lastTimeUsed: Date.now() - 3_600_000 },
  { packageName: 'com.google.android.youtube', totalTimeInForegroundMs: 3_720_000, totalTimeMinutes: 62, lastTimeUsed: Date.now() - 7_200_000 },
  { packageName: 'com.reddit.frontpage', totalTimeInForegroundMs: 1_200_000, totalTimeMinutes: 20, lastTimeUsed: Date.now() - 14_400_000 },
];

/**
 * Safely returns the native module, or null if not linked (Expo Go / iOS / web).
 * The library exports a Proxy that throws on any property access when the
 * native module is missing — we catch that here.
 */
function getNativeModule(): Record<string, (...args: any[]) => Promise<any>> | null {
  if (Platform.OS !== 'android') return null;
  try {
    const mod = require('@brighthustle/react-native-usage-stats-manager');
    // The library exports `checkPermission`, not `checkForPermission`.
    // Accepting either name guards against future library renames.
    const hasCheck =
      typeof mod?.checkPermission === 'function' ||
      typeof mod?.checkForPermission === 'function';
    if (!mod || !hasCheck) return null;
    return mod as Record<string, (...args: any[]) => Promise<any>>;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Performs a real native permission check via AppOpsManager.
 * On non-Android platforms always returns true.
 */
export async function isUsagePermissionGranted(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    // `checkPermission` is the correct method name in @brighthustle/react-native-usage-stats-manager.
    // Fall back to `checkForPermission` if an older build of the library is linked.
    const fn = mod.checkPermission ?? mod.checkForPermission;
    const result = await fn();
    return result === true || result === 1 || result === 'granted';
  } catch {
    return false;
  }
}

/**
 * Opens the Android "Usage Access" special-permission settings page.
 * Prefers the native module's built-in launcher; falls back to
 * PermissionService → IntentLauncher → Linking.openSettings().
 */
export async function openUsageAccessSettings(
  packageName = 'com.focusguard.app',
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = getNativeModule();
  if (mod?.showUsageAccessSettings) {
    try {
      await mod.showUsageAccessSettings(packageName);
      return;
    } catch {}
  }
  const { openUsageAccessSettings: fallback } = await import('./PermissionService');
  await fallback();
}

/**
 * Queries the last 24 hours of per-app foreground time from the OS.
 * Filters out system/self apps, sorts descending by time, caps at 20 apps.
 * Falls back to AsyncStorage cache, then static mock data.
 */
export async function queryLast24hStats(): Promise<AppUsageStat[]> {
  if (Platform.OS !== 'android') return MOCK_STATS;

  const mod = getNativeModule();
  if (!mod) {
    const cached = await getCachedStats();
    return cached ?? MOCK_STATS;
  }

  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;

  try {
    const raw: unknown = await mod.queryAndAggregateUsageStats(yesterday, now);
    const stats = parseStats(raw)
      .filter(s => !isSystemApp(s.packageName) && s.totalTimeMinutes > 0)
      .sort((a, b) => b.totalTimeInForegroundMs - a.totalTimeInForegroundMs)
      .slice(0, 20);

    await setCachedStats(stats);
    return stats;
  } catch (err) {
    console.warn('[UsageStats] queryLast24hStats error:', err);
    const cached = await getCachedStats();
    return cached ?? MOCK_STATS;
  }
}

/**
 * Returns the package name of the app currently in the foreground by
 * inspecting ACTIVITY_RESUMED events from the last 30 seconds.
 * Returns null on non-Android or when permission is missing.
 */
export async function getForegroundApp(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const mod = getNativeModule();
  if (!mod) return null;

  const now = Date.now();
  try {
    const events: Array<{ packageName: string; eventType: number; timeStamp: number }> =
      await mod.queryEvents(now - 30_000, now);

    if (!Array.isArray(events) || events.length === 0) return null;

    const latest = events
      .filter(e => e.eventType === 1 /* ACTIVITY_RESUMED */)
      .sort((a, b) => b.timeStamp - a.timeStamp);

    return latest.length > 0 ? latest[0].packageName : null;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses the raw response from queryAndAggregateUsageStats().
 * Handles both array and object (Map-like) shapes that different
 * Android versions / library versions may return.
 */
function parseStats(raw: unknown): AppUsageStat[] {
  const results: AppUsageStat[] = [];
  if (!raw) return results;

  const toMs = (item: Record<string, any>): number =>
    item.totalTimeInForeground ??
    item.totalTimeInForegroundMillis ??
    item.totalTimeVisible ??
    0;

  if (Array.isArray(raw)) {
    for (const item of raw as Record<string, any>[]) {
      const ms = toMs(item);
      if (ms > 0) {
        results.push({
          packageName: String(item.packageName ?? ''),
          totalTimeInForegroundMs: ms,
          totalTimeMinutes: Math.round(ms / 60_000),
          lastTimeUsed: item.lastTimeUsed ?? 0,
        });
      }
    }
  } else if (typeof raw === 'object') {
    for (const [pkg, data] of Object.entries(raw as Record<string, any>)) {
      const ms = toMs(data);
      if (ms > 0) {
        results.push({
          packageName: pkg,
          totalTimeInForegroundMs: ms,
          totalTimeMinutes: Math.round(ms / 60_000),
          lastTimeUsed: data.lastTimeUsed ?? 0,
        });
      }
    }
  }

  return results;
}

const SYSTEM_PREFIXES = [
  'com.android.',
  'com.google.android.gms',
  'com.google.android.gsf',
  'com.google.android.inputmethod',
  'android',
  'com.sec.android.',
  'com.samsung.',
  'com.miui.',
  'com.huawei.',
  'com.focusguard.app',
];

function isSystemApp(pkg: string): boolean {
  return SYSTEM_PREFIXES.some(p => pkg === p || pkg.startsWith(p));
}

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry {
  ts: number;
  data: AppUsageStat[];
}

async function getCachedStats(): Promise<AppUsageStat[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

async function setCachedStats(data: AppUsageStat[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}
