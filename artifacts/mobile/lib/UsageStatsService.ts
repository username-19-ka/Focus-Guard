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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface AppUsageStat {
  packageName: string;
  totalTimeInForegroundMs: number;
  totalTimeMinutes: number;
  lastTimeUsed: number;
}

const CACHE_KEY = "usage_stats_cache";
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Safely returns the native module, or null if not linked (Expo Go / iOS / web).
 */
function getNativeModule(): Record<
  string,
  (...args: any[]) => Promise<any>
> | null {
  if (Platform.OS !== "android") return null;
  try {
    const mod = require("@brighthustle/react-native-usage-stats-manager");
    const hasCheck =
      typeof mod?.checkPermission === "function" ||
      typeof mod?.checkForPermission === "function";
    if (!mod || !hasCheck) return null;
    return mod as Record<string, (...args: any[]) => Promise<any>>;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Performs a real native permission check via AppOpsManager.
 * On non-Android platforms returns false.
 */
export async function isUsagePermissionGranted(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    const result = mod.checkPermission
      ? await mod.checkPermission()
      : await mod.checkForPermission();
    return result === true || result === 1 || result === "granted";
  } catch (err) {
    console.warn("[UsageStats] isUsagePermissionGranted error:", err);
    return false;
  }
}

/**
 * NEW — Checks if the "Display Over Other Apps" overlay permission is granted.
 * This is separate from Usage Stats permission and required for the blocking screen.
 */
export async function isOverlayPermissionGranted(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const { NativeModules } = require("react-native");
    // Use native module if available
    if (NativeModules?.OverlayPermission?.isGranted) {
      const result = await NativeModules.OverlayPermission.isGranted();
      return result === true || result === 1 || result === "granted";
    }
    // Fallback: use @brighthustle module if it exposes overlay check
    const mod = getNativeModule();
    if (mod?.checkOverlayPermission) {
      const result = await mod.checkOverlayPermission();
      return result === true || result === 1 || result === "granted";
    }
    console.warn(
      "[UsageStats] No native overlay permission checker found, defaulting to false",
    );
    return false;
  } catch (err) {
    console.warn("[UsageStats] isOverlayPermissionGranted error:", err);
    return false;
  }
}

/**
 * Checks BOTH usage stats AND overlay permissions at once.
 * Use this before syncing to Supabase.
 */
export async function areAllPermissionsGranted(): Promise<{
  usageStats: boolean;
  overlay: boolean;
  allGranted: boolean;
}> {
  const [usageStats, overlay] = await Promise.all([
    isUsagePermissionGranted(),
    isOverlayPermissionGranted(),
  ]);
  return {
    usageStats,
    overlay,
    allGranted: usageStats && overlay,
  };
}

/**
 * Opens the Android "Usage Access" special-permission settings page.
 */
export async function openUsageAccessSettings(
  packageName = "com.focusguard.app",
): Promise<void> {
  if (Platform.OS !== "android") return;
  const mod = getNativeModule();
  if (mod?.showUsageAccessSettings) {
    try {
      await mod.showUsageAccessSettings(packageName);
      return;
    } catch (err) {
      console.warn("[UsageStats] showUsageAccessSettings error:", err);
    }
  }
  const { openUsageAccessSettings: fallback } = await import(
    "./PermissionService"
  );
  await fallback();
}

/**
 * NEW — Opens the Android "Display Over Other Apps" overlay settings page.
 */
export async function openOverlaySettings(
  packageName = "com.focusguard.app",
): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const { Linking } = await import("react-native");
    await Linking.openSettings();
  } catch (err) {
    console.warn("[UsageStats] openOverlaySettings error:", err);
  }
}

/**
 * Queries the last 24 hours of per-app foreground time from the OS.
 * Filters out system/self apps, sorts descending by time, caps at 20 apps.
 * Falls back to AsyncStorage cache, then empty array.
 */
export async function queryLast24hStats(): Promise<AppUsageStat[]> {
  if (Platform.OS !== "android") return [];

  const mod = getNativeModule();
  if (!mod) {
    const cached = await getCachedStats();
    return cached ?? [];
  }

  const now = Date.now();
  const yesterday = now - 24 * 60 * 60 * 1000;

  try {
    const raw: unknown = await mod.queryAndAggregateUsageStats(yesterday, now);
    const stats = parseStats(raw)
      .filter((s) => !isSystemApp(s.packageName) && s.totalTimeMinutes > 0)
      .sort((a, b) => b.totalTimeInForegroundMs - a.totalTimeInForegroundMs)
      .slice(0, 20);

    await setCachedStats(stats);
    return stats;
  } catch (err) {
    console.warn("[UsageStats] queryLast24hStats error:", err);
    const cached = await getCachedStats();
    return cached ?? [];
  }
}

/**
 * Returns the package name of the app currently in the foreground.
 * Looks back 60 seconds (increased from 30s for reliability).
 * Returns null on non-Android or when permission is missing.
 */
export async function getForegroundApp(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const mod = getNativeModule();
  if (!mod) return null;

  const now = Date.now();
  try {
    const events: Array<{
      packageName: string;
      eventType: number;
      timeStamp: number;
    }> = await mod.queryEvents(now - 60_000, now); // ✅ increased from 30s to 60s

    if (!Array.isArray(events) || events.length === 0) return null;

    const latest = events
      .filter((e) => e.eventType === 1 /* ACTIVITY_RESUMED */)
      .sort((a, b) => b.timeStamp - a.timeStamp);

    return latest.length > 0 ? latest[0].packageName : null;
  } catch (err) {
    console.warn("[UsageStats] getForegroundApp error:", err); // ✅ no longer silent
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
          packageName: String(item.packageName ?? ""),
          totalTimeInForegroundMs: ms,
          totalTimeMinutes: Math.round(ms / 60_000),
          lastTimeUsed: item.lastTimeUsed ?? 0,
        });
      }
    }
  } else if (typeof raw === "object") {
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
  "com.android.",
  "com.google.android.gms",
  "com.google.android.gsf",
  "com.google.android.inputmethod",
  "android",
  "com.sec.android.",
  "com.samsung.",
  "com.miui.",
  "com.huawei.",
  "com.focusguard.app",
];

function isSystemApp(pkg: string): boolean {
  return SYSTEM_PREFIXES.some((p) => pkg === p || pkg.startsWith(p));
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
  } catch (err) {
    console.warn("[UsageStats] getCachedStats error:", err);
    return null;
  }
}

async function setCachedStats(data: AppUsageStat[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch (err) {
    console.warn("[UsageStats] setCachedStats error:", err);
  }
}
