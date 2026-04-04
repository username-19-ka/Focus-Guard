/**
 * AppTrackingService — JS-side foreground-app polling (1 000 ms interval).
 *
 * This supplements the native ForegroundAppService by providing a JS-observable
 * stream of the current foreground app. Useful for in-app responses (e.g. showing
 * the BlockOverlay component within the React Native context when the user returns
 * to FocusGuard after being blocked).
 *
 * The native ForegroundAppService handles cross-app blocking independently.
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import { getForegroundApp } from '@focusguard/app-tracking';

type Listener = (packageName: string | null) => void;

class AppTrackingService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<Listener> = new Set();
  private lastForeground: string | null = null;
  private appStateSubscription: { remove: () => void } | null = null;

  start() {
    if (Platform.OS !== 'android') return;
    if (this.intervalId !== null) return;

    this.appStateSubscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          this.poll();
        }
      }
    );

    this.intervalId = setInterval(() => this.poll(), 1000);
    this.poll();
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  addListener(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async poll() {
    try {
      const pkg = await getForegroundApp();
      if (pkg !== this.lastForeground) {
        this.lastForeground = pkg;
        this.listeners.forEach((fn) => fn(pkg));
      }
    } catch {}
  }

  getCurrentForeground(): string | null {
    return this.lastForeground;
  }
}

export const appTrackingService = new AppTrackingService();
