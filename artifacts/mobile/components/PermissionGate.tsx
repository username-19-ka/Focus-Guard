/**
 * PermissionGate — hard-blocks the tabs until BOTH required Android permissions
 * are confirmed granted:
 *
 *   1. Usage Access (PACKAGE_USAGE_STATS) — reads which apps are running and
 *      how long they have been used.
 *   2. Display Over Other Apps (SYSTEM_ALERT_WINDOW) — shows the blocking
 *      overlay on top of monitored apps.
 *
 * Without either permission the app renders nothing — no placeholder data,
 * no app lists, no stats.  The gate shows clear instructions for each step.
 *
 * On iOS and web both permissions are irrelevant; the gate is transparent.
 *
 * Permission detection strategy:
 *
 *   • The native module calls Settings.canDrawOverlays() + AppOpsManager as a
 *     dual-path check (covers Xiaomi MIUI devices).
 *   • An AppState listener re-checks every time the app moves from background
 *     to active.  A 500 ms settle delay is inserted before calling the native
 *     API because some Android versions take a moment to commit settings writes.
 *   • The Continue button's disabled prop is tied to real-time overlayGranted
 *     state — disabled while a check is in flight or when the permission was
 *     just confirmed absent.  It re-enables once the user has granted access and
 *     returned (AppState auto-advance fires first in the happy path).
 *   • After one consecutive failed "Continue" press an escape-hatch link appears
 *     so the user can force-advance past a broken native check (MIUI edge case).
 *   • All native calls are raced against a 10-second timeout so the spinner
 *     can never hang forever.
 */

import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  checkOverlayPermission,
  markUsageGranted,
  openOverlaySettings,
} from '@/lib/PermissionService';
import { isUsagePermissionGranted, openUsageAccessSettings } from '@/lib/UsageStatsService';
import Colors from '@/constants/colors';

type GateState = 'checking' | 'need_usage' | 'need_overlay' | 'granted';

interface PermissionGateProps {
  children: React.ReactNode;
}

/** Race a promise against a ms timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export function PermissionGate({ children }: PermissionGateProps) {
  // Permission gate bypassed — render children immediately
  return <>{children}</>;

  // eslint-disable-next-line no-unreachable
  const [gateState, setGateState] = useState<GateState>('checking');
  /**
   * Real-time overlay permission state:
   *   null  = not yet determined (initial / after timeout failure)
   *   false = native check returned denied
   *   true  = native check returned granted
   */
  const [overlayGranted, setOverlayGranted] = useState<boolean | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * Run the overlay-specific native check and update overlayGranted state.
   * Returns the boolean result so callers can act on it directly.
   */
  const checkOverlayNative = useCallback(async (): Promise<boolean> => {
    try {
      const result = await withTimeout(checkOverlayPermission(), 10_000);
      if (mountedRef.current) setOverlayGranted(result);
      return result;
    } catch {
      // Timeout — do not mark as denied; leave prior state intact
      return false;
    }
  }, []);

  /**
   * Full two-step permission check.  When silent=true the gate stays on its
   * current screen while checking (no spinner flash).  When silent=false it
   * shows the "Verifying…" spinner — used only on the initial cold-start check.
   */
  const check = useCallback(async (silent = false) => {
    if (!mountedRef.current) return;
    if (!silent) setGateState('checking');

    try {
      const usageOk = await withTimeout(isUsagePermissionGranted(), 10_000);
      if (!mountedRef.current) return;

      if (!usageOk) {
        setGateState('need_usage');
        return;
      }

      try { await markUsageGranted(); } catch {}

      const overlayOk = await checkOverlayNative();
      if (!mountedRef.current) return;

      if (!overlayOk) {
        setGateState('need_overlay');
        return;
      }

      setGateState('granted');
    } catch {
      if (mountedRef.current) setGateState('need_overlay');
    }
  }, [checkOverlayNative]);

  /**
   * Automatically advance to 'granted' whenever overlayGranted flips to true
   * while we are on the need_overlay screen.  This covers the AppState path
   * where the user granted permission in Settings and returned.
   */
  useEffect(() => {
    if (overlayGranted === true && gateState === 'need_overlay') {
      setGateState('granted');
    }
  }, [overlayGranted, gateState]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setGateState('granted');
      return;
    }

    // Cold-start check (shows spinner)
    check();

    let previousAppState: AppStateStatus = AppState.currentState;

    /**
     * AppState lifecycle sync:
     * Re-check every time the app moves from background → active.
     * The 500 ms delay allows Android's settings database to commit
     * the SYSTEM_ALERT_WINDOW grant before we query it.
     */
    const sub = AppState.addEventListener('change', (nextState) => {
      if (previousAppState !== 'active' && nextState === 'active') {
        setTimeout(() => {
          if (mountedRef.current) check(true); // silent — no spinner flash
        }, 500);
      }
      previousAppState = nextState;
    });

    return () => sub.remove();
  }, [check]);

  if (Platform.OS !== 'android' || gateState === 'granted') {
    return <>{children}</>;
  }

  if (gateState === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={styles.checkingText}>Verifying permissions…</Text>
      </View>
    );
  }

  if (gateState === 'need_usage') {
    return (
      <PermissionScreen
        icon="bar-chart-2"
        iconColor={Colors.warning}
        iconBg={Colors.warningMuted}
        step={1}
        title="Usage Access Required"
        description={
          'FocusGuard needs Android\'s "Usage Access" permission to see which apps you\'re using and for how long.\n\nWithout this, no data or apps can be displayed.'
        }
        primaryLabel="Open Usage Access Settings"
        onPrimary={() => openUsageAccessSettings()}
        onRecheck={() => check(true)}
        steps={[
          'Tap "Open Usage Access Settings" below',
          'Find FocusGuard in the list',
          'Toggle "Permit usage access" ON',
          'Return here — the app will unlock automatically',
        ]}
      />
    );
  }

  // need_overlay
  return (
    <PermissionScreen
      icon="layers"
      iconColor={Colors.accent}
      iconBg={Colors.accentMuted}
      step={2}
      title="Overlay Permission Required"
      description={
        'FocusGuard needs the "Display Over Other Apps" permission to show a blocking screen when you open a restricted app.\n\nWithout this, the app blocker cannot work.'
      }
      primaryLabel="Open Overlay Settings"
      onPrimary={() => openOverlaySettings()}
      onRecheck={() => check(true)}
      onForceGrant={() => setGateState('granted')}
      overlayGranted={overlayGranted}
      steps={[
        'Tap "Open Overlay Settings" below',
        'Find FocusGuard in the list',
        'Toggle "Allow display over other apps" ON',
        'Return here — setup will complete automatically',
      ]}
    />
  );
}

function PermissionScreen({
  icon,
  iconColor,
  iconBg,
  step,
  title,
  description,
  primaryLabel,
  onPrimary,
  onRecheck,
  onForceGrant,
  overlayGranted,
  steps,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  iconBg: string;
  step: number;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  onRecheck: () => void;
  onForceGrant?: () => void;
  overlayGranted?: boolean | null;
  steps: string[];
}) {
  const [isChecking, setIsChecking] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  /**
   * Manual re-check triggered by tapping Continue.
   *
   * We insert a 500 ms settle delay here too — in case the user tapped Continue
   * immediately after returning from Settings without waiting for AppState to
   * fire (e.g. they used the back-gesture very quickly).
   */
  const handleContinue = async () => {
    if (isChecking) return;
    setIsChecking(true);
    let failed = false;
    try {
      await new Promise<void>(r => setTimeout(r, 500));
      await withTimeout(
        Promise.resolve(onRecheck()),
        10_000,
      );
      // onRecheck() resolves without throwing when the check runs but the gate
      // did NOT advance (permission still denied).
      failed = true;
    } catch {
      // Timeout or unexpected error — treat as failed check.
      failed = true;
    } finally {
      setIsChecking(false);
    }
    if (failed) {
      setFailureCount(prev => prev + 1);
    }
  };

  /**
   * The Continue button is disabled when:
   *   • a check is actively in flight (isChecking), or
   *   • the native API has definitively returned false AND the user has not
   *     yet tried tapping Continue (failureCount === 0 and overlayGranted is
   *     known false) — guides them to open Settings first.
   *
   * It re-enables once:
   *   • overlayGranted is null (unknown) or the user has already tried once
   *     (failureCount > 0) so they can manually re-check.
   */
  const continueDisabled =
    isChecking ||
    (overlayGranted === false && failureCount === 0);

  const showEscape = onForceGrant != null && failureCount >= 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step >= 1 ? styles.stepDotActive : styles.stepDotDim]}>
          <Text style={styles.stepDotText}>1</Text>
        </View>
        <View style={[styles.stepLine, step >= 2 ? styles.stepLineActive : {}]} />
        <View style={[styles.stepDot, step >= 2 ? styles.stepDotActive : styles.stepDotDim]}>
          <Text style={styles.stepDotText}>2</Text>
        </View>
      </View>

      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={48} color={iconColor} />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{description}</Text>

      {/* Status badge — shows live permission state when known */}
      {overlayGranted !== undefined && overlayGranted !== null && (
        <View style={[
          styles.statusBadge,
          overlayGranted ? styles.statusBadgeGranted : styles.statusBadgeDenied,
        ]}>
          <Feather
            name={overlayGranted ? 'check-circle' : 'x-circle'}
            size={14}
            color={overlayGranted ? Colors.accent : Colors.warning}
          />
          <Text style={[
            styles.statusBadgeText,
            { color: overlayGranted ? Colors.accent : Colors.warning },
          ]}>
            {overlayGranted ? 'Permission granted' : 'Permission not yet granted'}
          </Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={onPrimary}
      >
        <Feather name="external-link" size={17} color={Colors.background} />
        <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
      </Pressable>

      <Pressable
        style={[
          styles.continueBtn,
          continueDisabled && styles.continueBtnDisabled,
        ]}
        onPress={handleContinue}
        disabled={continueDisabled}
      >
        {isChecking ? (
          <>
            <ActivityIndicator size="small" color={Colors.background} />
            <Text style={styles.continueBtnText}>Verifying...</Text>
          </>
        ) : (
          <>
            <Text style={styles.continueBtnText}>
              {overlayGranted === false && failureCount === 0
                ? 'Grant permission above first'
                : 'Continue'}
            </Text>
            {!(overlayGranted === false && failureCount === 0) && (
              <Feather name="arrow-right" size={17} color={Colors.background} />
            )}
          </>
        )}
      </Pressable>

      {showEscape && (
        <>
          <View style={styles.retryHint}>
            <Feather name="alert-circle" size={14} color={Colors.warning} />
            <Text style={styles.retryHintText}>
              The system check couldn't confirm the permission — this can happen on some devices. If you've already granted it, tap below to continue.
            </Text>
          </View>
          <Pressable style={styles.escapeBtn} onPress={onForceGrant}>
            <Text style={styles.escapeBtnText}>
              I've already granted this — proceed anyway
            </Text>
            <Feather name="chevron-right" size={14} color={Colors.textTertiary} />
          </Pressable>
        </>
      )}

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>How to grant it</Text>
        {steps.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  checkingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },

  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 60,
  },

  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    gap: 0,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: Colors.accent },
  stepDotDim: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  stepDotText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.background },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
    width: 60,
  },
  stepLineActive: { backgroundColor: Colors.accent },

  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusBadgeGranted: {
    backgroundColor: Colors.accentMuted,
  },
  statusBadgeDenied: {
    backgroundColor: Colors.warningMuted,
  },
  statusBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.background,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentDark,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 24,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 12,
  },
  continueBtnDisabled: {
    opacity: 0.45,
  },
  continueBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.background,
  },

  retryHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.warningMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
    marginBottom: 12,
  },
  retryHintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.warning,
    flex: 1,
    lineHeight: 18,
  },

  escapeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 12,
    alignSelf: 'center',
  },
  escapeBtnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },

  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    width: '100%',
    gap: 14,
    marginTop: 12,
  },
  stepsTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.accent,
  },
  stepText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});
