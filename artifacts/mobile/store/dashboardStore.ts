import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import {
  queryLast24hStats,
  isUsagePermissionGranted,
} from "@/lib/UsageStatsService";
import { getAppInfo } from "@/lib/AppNameMapper";
import { PermissionsAndroid, NativeModules, Platform } from "react-native";

export interface ShameEntry {
  id: string;
  app: string;
  time: string;
  date: string;
}

export interface MappedApp {
  packageName: string;
  name: string;
  icon: string;
  color: string;
  usage: number;
  limit: number;
  isRealData: boolean;
}

const DEFAULT_LIMIT = 60;

interface DashboardState {
  timeSavedMinutes: number;
  focusRatioPercent: number;
  streakDays: number;
  wallOfShameToday: number;
  wallOfShameTotal: number;
  shameHistory: ShameEntry[];
  weeklyData: number[];
  weekLabels: string[];
  beforeDailyMinutes: number;
  afterDailyMinutes: number;
  globalRank: number | null;
  leaderboardOptIn: boolean;
  focusModeActive: boolean;
  isSyncing: boolean;
  lastSynced: Date | null;
  isInitialized: boolean;

  topApps: MappedApp[];
  usagePermissionGranted: boolean;
  overlayPermissionGranted: boolean;
  isLoadingUsage: boolean;

  /** Epoch ms when the user last completed a challenge. Null = never. */
  challengeUnlockedAt: number | null;

  init: () => Promise<void>;
  incrementShame: (appName?: string) => Promise<void>;
  toggleLeaderboard: () => void;
  toggleFocusMode: () => void;
  syncFromSupabase: (userId: string) => Promise<void>;
  syncToSupabase: (userId: string) => Promise<void>;
  getShareText: () => string;
  refreshUsageStats: () => Promise<void>;
  checkOverlayPermission: () => Promise<boolean>;
  /** Call when a challenge finishes — grants a timed unlock window (10 min). */
  unlockFocus: () => void;
  /** Returns true if a challenge was completed within the last 10 minutes. */
  isChallengeUnlocked: () => boolean;
}

const STORAGE_KEYS = {
  shameTotal: "wallOfShameCount",
  shameHistory: "shameHistory",
  streakDays: "streakDays",
  weeklyData: "weeklyData",
  leaderboardOptIn: "leaderboardOptIn",
  focusMode: "focusModeActive",
};

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getTimeStr() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getWeekLabels(): string[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 6 + i);
    return days[d.getDay()];
  });
}

// ─── Overlay permission helper ────────────────────────────────────────────────
async function checkOverlayPermissionNative(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    // Use your native module if available (e.g. OverlayPermission or FocusGuard module)
    const { OverlayPermission } = NativeModules;
    if (OverlayPermission?.isGranted) {
      return await OverlayPermission.isGranted();
    }
    // Fallback: Android 6+ Settings.canDrawOverlays check via PermissionsAndroid
    // Note: PermissionsAndroid doesn't cover SYSTEM_ALERT_WINDOW directly,
    // so if you have a native module, prefer that. This is a safe fallback.
    return false;
  } catch (e) {
    console.warn("[Dashboard] checkOverlayPermission error:", e);
    return false;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export const useDashboardStore = create<DashboardState>((set, get) => ({
  timeSavedMinutes: 0,
  focusRatioPercent: 0,
  streakDays: 0,
  wallOfShameToday: 0,
  wallOfShameTotal: 0,
  shameHistory: [],
  weeklyData: Array(7).fill(0),
  weekLabels: getWeekLabels(),
  beforeDailyMinutes: 0,
  afterDailyMinutes: 0,
  globalRank: null,
  leaderboardOptIn: false,
  focusModeActive: false,
  isSyncing: false,
  lastSynced: null,
  isInitialized: false,

  topApps: [],
  usagePermissionGranted: false,
  overlayPermissionGranted: false,
  isLoadingUsage: false,
  challengeUnlockedAt: null,

  unlockFocus: () => {
    set({ challengeUnlockedAt: Date.now() });
  },

  isChallengeUnlocked: () => {
    const t = get().challengeUnlockedAt;
    if (!t) return false;
    return Date.now() - t < 10 * 60 * 1000;
  },

  // ─── NEW: check overlay and update state ──────────────────────────────────
  checkOverlayPermission: async () => {
    const granted = await checkOverlayPermissionNative();
    set({ overlayPermissionGranted: granted });
    return granted;
  },

  init: async () => {
    if (get().isInitialized) return;

    const [totalStr, historyStr, streakStr, weeklyStr, optInStr, focusModeStr] =
      await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.shameTotal),
        AsyncStorage.getItem(STORAGE_KEYS.shameHistory),
        AsyncStorage.getItem(STORAGE_KEYS.streakDays),
        AsyncStorage.getItem(STORAGE_KEYS.weeklyData),
        AsyncStorage.getItem(STORAGE_KEYS.leaderboardOptIn),
        AsyncStorage.getItem(STORAGE_KEYS.focusMode),
      ]);

    const totalCount = totalStr ? parseInt(totalStr, 10) : 0;
    const allHistory: ShameEntry[] = historyStr ? JSON.parse(historyStr) : [];
    const today = getTodayStr();
    const todayHistory = allHistory.filter((e) => e.date === today);
    const streakDays = streakStr ? parseInt(streakStr, 10) : 0;
    const weeklyData = weeklyStr ? JSON.parse(weeklyStr) : Array(7).fill(0);

    set({
      wallOfShameTotal: totalCount,
      wallOfShameToday: todayHistory.length,
      shameHistory: todayHistory,
      streakDays,
      weeklyData,
      weekLabels: getWeekLabels(),
      leaderboardOptIn: optInStr === "true",
      focusModeActive: focusModeStr === "true",
      isInitialized: true,
    });

    // Check overlay permission on init — do NOT sync yet
    await get().checkOverlayPermission();

    // Load usage stats independently (doesn't need overlay)
    get().refreshUsageStats();
  },

  refreshUsageStats: async () => {
    set({ isLoadingUsage: true });
    try {
      const granted = await isUsagePermissionGranted();
      set({ usagePermissionGranted: granted });

      const stats = await queryLast24hStats();
      const topApps: MappedApp[] = stats.slice(0, 6).map((s) => {
        const info = getAppInfo(s.packageName);
        return {
          packageName: s.packageName,
          name: info.name,
          icon: info.icon,
          color: info.color,
          usage: s.totalTimeMinutes,
          limit: DEFAULT_LIMIT,
          isRealData: granted,
        };
      });

      if (topApps.length > 0) {
        const totalUsageMinutes = stats.reduce(
          (sum, s) => sum + s.totalTimeMinutes,
          0,
        );
        const wakeMinutes = 16 * 60;
        const focusRatioPercent = Math.round(
          Math.max(
            0,
            Math.min(
              100,
              ((wakeMinutes - totalUsageMinutes) / wakeMinutes) * 100,
            ),
          ),
        );
        const timeSavedMinutes = Math.max(
          0,
          get().beforeDailyMinutes - totalUsageMinutes,
        );

        set({
          topApps,
          afterDailyMinutes: totalUsageMinutes,
          focusRatioPercent,
          timeSavedMinutes,
        });
      } else {
        set({ topApps: [] });
      }
    } catch (err) {
      console.warn("[Dashboard] refreshUsageStats error:", err);
    } finally {
      set({ isLoadingUsage: false });
    }
  },

  incrementShame: async (appName = "Unknown App") => {
    const entry: ShameEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      app: appName,
      time: getTimeStr(),
      date: getTodayStr(),
    };

    const newTotal = get().wallOfShameTotal + 1;
    const newTodayCount = get().wallOfShameToday + 1;
    const newHistory = [entry, ...get().shameHistory];

    set({
      wallOfShameTotal: newTotal,
      wallOfShameToday: newTodayCount,
      shameHistory: newHistory,
    });

    const allHistoryStr = await AsyncStorage.getItem(STORAGE_KEYS.shameHistory);
    const allHistory: ShameEntry[] = allHistoryStr
      ? JSON.parse(allHistoryStr)
      : [];
    const updatedAll = [entry, ...allHistory].slice(0, 200);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.shameTotal, String(newTotal)),
      AsyncStorage.setItem(
        STORAGE_KEYS.shameHistory,
        JSON.stringify(updatedAll),
      ),
    ]);
  },

  toggleLeaderboard: () => {
    const next = !get().leaderboardOptIn;
    set({
      leaderboardOptIn: next,
      globalRank: next ? Math.floor(Math.random() * 9000) + 100 : null,
    });
    AsyncStorage.setItem(STORAGE_KEYS.leaderboardOptIn, String(next));
  },

  toggleFocusMode: () => {
    const next = !get().focusModeActive;
    set({ focusModeActive: next });
    AsyncStorage.setItem(STORAGE_KEYS.focusMode, String(next));
  },

  // ─── FIXED: always check overlay before syncing to Supabase ──────────────
  syncFromSupabase: async (userId: string) => {
    if (!userId) return;

    // ✅ Gate: overlay must be granted before syncing
    const overlayOk = await get().checkOverlayPermission();
    if (!overlayOk) {
      console.warn(
        "[Dashboard] syncFromSupabase blocked — overlay permission not granted",
      );
      return;
    }

    set({ isSyncing: true });
    try {
      const { data, error } = await supabase
        .from("focus_profiles")
        .select(
          "streak_days, total_time_saved_minutes, wall_of_shame_total, weekly_data, leaderboard_opt_in, global_rank",
        )
        .eq("id", userId)
        .single();

      if (error || !data) return;

      set({
        streakDays: data.streak_days ?? get().streakDays,
        timeSavedMinutes:
          data.total_time_saved_minutes ?? get().timeSavedMinutes,
        wallOfShameTotal: data.wall_of_shame_total ?? get().wallOfShameTotal,
        weeklyData: data.weekly_data ?? get().weeklyData,
        leaderboardOptIn: data.leaderboard_opt_in ?? get().leaderboardOptIn,
        globalRank: data.global_rank ?? get().globalRank,
        lastSynced: new Date(),
      });

      if (data.streak_days != null) {
        AsyncStorage.setItem(STORAGE_KEYS.streakDays, String(data.streak_days));
      }
    } catch {
    } finally {
      set({ isSyncing: false });
    }
  },

  syncToSupabase: async (userId: string) => {
    if (!userId) return;

    // ✅ Gate: overlay must be granted before syncing
    const overlayOk = await get().checkOverlayPermission();
    if (!overlayOk) {
      console.warn(
        "[Dashboard] syncToSupabase blocked — overlay permission not granted",
      );
      return;
    }

    const state = get();
    try {
      await supabase.from("focus_profiles").upsert({
        id: userId,
        streak_days: state.streakDays,
        total_time_saved_minutes: state.timeSavedMinutes,
        wall_of_shame_total: state.wallOfShameTotal,
        weekly_data: state.weeklyData,
        leaderboard_opt_in: state.leaderboardOptIn,
        updated_at: new Date().toISOString(),
      });
    } catch {}
  },

  getShareText: () => {
    const state = get();
    const hours = Math.floor(state.timeSavedMinutes / 60);
    const mins = state.timeSavedMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return `I've saved ${timeStr} this week and am on a ${state.streakDays}-day streak on #FocusGuard. My Wall of Shame count? ${state.wallOfShameToday}. Can you beat that?`;
  },
}));
