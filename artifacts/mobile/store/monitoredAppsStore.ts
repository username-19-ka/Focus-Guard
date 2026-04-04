import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { startMonitoring, stopMonitoring, updateMonitoredApps } from '@focusguard/app-tracking';

const STORAGE_KEY = '@focusguard_monitored_apps_v1';

export interface MonitoredApp {
  packageName: string;
  name: string;
  isSystemApp: boolean;
  addedAt: number;
}

interface MonitoredAppsState {
  monitoredApps: MonitoredApp[];
  isServiceRunning: boolean;
  isLoading: boolean;

  load: () => Promise<void>;
  addApp: (app: MonitoredApp) => Promise<void>;
  removeApp: (packageName: string) => Promise<void>;
  toggleApp: (app: MonitoredApp) => Promise<void>;
  isMonitored: (packageName: string) => boolean;
  startService: () => Promise<void>;
  stopService: () => Promise<void>;
  syncService: () => Promise<void>;
}

export const useMonitoredAppsStore = create<MonitoredAppsState>((set, get) => ({
  monitoredApps: [],
  isServiceRunning: false,
  isLoading: true,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const apps: MonitoredApp[] = raw ? JSON.parse(raw) : [];
      set({ monitoredApps: apps, isLoading: false });
      if (apps.length > 0) {
        await get().startService();
      }
    } catch {
      set({ isLoading: false });
    }
  },

  addApp: async (app: MonitoredApp) => {
    const { monitoredApps } = get();
    if (monitoredApps.some((a) => a.packageName === app.packageName)) return;
    const next = [...monitoredApps, { ...app, addedAt: Date.now() }];
    set({ monitoredApps: next });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await get().syncService();
  },

  removeApp: async (packageName: string) => {
    const next = get().monitoredApps.filter((a) => a.packageName !== packageName);
    set({ monitoredApps: next });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (next.length === 0) {
      await get().stopService();
    } else {
      await get().syncService();
    }
  },

  toggleApp: async (app: MonitoredApp) => {
    const { isMonitored, addApp, removeApp } = get();
    if (isMonitored(app.packageName)) {
      await removeApp(app.packageName);
    } else {
      await addApp(app);
    }
  },

  isMonitored: (packageName: string) => {
    return get().monitoredApps.some((a) => a.packageName === packageName);
  },

  startService: async () => {
    const pkgs = get().monitoredApps.map((a) => a.packageName);
    if (pkgs.length === 0) return;
    try {
      await startMonitoring(pkgs);
      set({ isServiceRunning: true });
    } catch (e) {
      console.warn('[MonitoredAppsStore] startService error:', e);
    }
  },

  stopService: async () => {
    try {
      await stopMonitoring();
      set({ isServiceRunning: false });
    } catch {}
  },

  syncService: async () => {
    const pkgs = get().monitoredApps.map((a) => a.packageName);
    if (pkgs.length === 0) {
      await get().stopService();
      return;
    }
    if (get().isServiceRunning) {
      await updateMonitoredApps(pkgs);
    } else {
      await get().startService();
    }
  },
}));
