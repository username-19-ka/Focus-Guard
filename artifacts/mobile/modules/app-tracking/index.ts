export interface InstalledApp {
  packageName: string;
  name: string;
  isSystemApp: boolean;
}

let NativeModule: Record<string, (...args: any[]) => Promise<any>> | null = null;
let moduleLookupDone = false;

function getModule() {
  if (moduleLookupDone) return NativeModule;
  moduleLookupDone = true;
  try {
    const { requireNativeModule } = require('expo-modules-core');
    NativeModule = requireNativeModule('AppTracking');
  } catch {
    NativeModule = null;
  }
  return NativeModule;
}

export async function getInstalledApps(): Promise<InstalledApp[]> {
  const mod = getModule();
  if (!mod) return [];
  try {
    return await mod.getInstalledApps();
  } catch {
    return [];
  }
}

export async function getForegroundApp(): Promise<string | null> {
  const mod = getModule();
  if (!mod) return null;
  try {
    return await mod.getForegroundApp();
  } catch {
    return null;
  }
}

export async function startMonitoring(packageNames: string[]): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.startMonitoring(packageNames);
  } catch (e) {
    console.warn('[AppTracking] startMonitoring error:', e);
  }
}

export async function stopMonitoring(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.stopMonitoring();
  } catch {}
}

export async function updateMonitoredApps(packageNames: string[]): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.updateMonitoredApps(packageNames);
  } catch {}
}

export async function showOverlay(packageName: string): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.showOverlay(packageName);
  } catch {}
}

export async function hideOverlay(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.hideOverlay();
  } catch {}
}

export async function hasOverlayPermission(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    return await mod.hasOverlayPermission();
  } catch {
    return false;
  }
}
