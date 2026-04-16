/**
 * PermissionGate
 *
 * Hard-blocks the tabs until both required Android permissions are confirmed
 * granted by the native OS, then initialises the user's Supabase profile.
 *
 * Flow:
 *   1. On mount — check Supabase: if permissions_verified=true for this
 *      account, skip the gate entirely (returning user, previously verified).
 *   2. Usage Access screen — user opens Settings, grants, returns.
 *        AppState fires (500 ms settle delay) → native re-check → auto-advance.
 *        Tapping Continue also triggers the native check. If denied → error.
 *   3. Overlay screen — same pattern as step 2.
 *        On success → initializeProfile() (fetch usage data, upsert Supabase,
 *        write AsyncStorage config) → enter the app.
 *
 * Error states:
 *   If a native check returns false the user sees:
 *     "Data sync failed. Please ensure permission is granted so we can
 *      set up your focus profile."
 *   with a Retry button and the Settings shortcut still visible.
 *
 * Reliability:
 *   • All native calls are raced against a 10 s timeout.
 *   • AppState fires a re-check with a 500 ms delay (Android settings DB
 *     settle time) each time the app returns from background.
 *   • If both native checks pass but Supabase write fails the user is still
 *     let in — local data always works without the cloud write.
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
import { checkOverlayPermission, openOverlaySettings } from '@/lib/PermissionService';
import { isUsagePermissionGranted, openUsageAccessSettings } from '@/lib/UsageStatsService';
import { checkPermissionsAlreadyVerified, initializeProfile } from '@/lib/ProfileInitService';
import Colors from '@/constants/colors';

type GateStep =
  | 'loading'      // initial Supabase check
  | 'usage'        // step 1: usage access
  | 'overlay'      // step 2: overlay
  | 'syncing'      // profile initialisation in progress
  | 'done';        // both granted + profile initialised

interface PermissionGateProps {
  children: React.ReactNode;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export function PermissionGate({ children }: PermissionGateProps) {
  const [step, setStep] = useState<GateStep>('loading');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ─── Boot: check if this account already verified permissions ───────────────
  useEffect(() => {
    if (Platform.OS !== 'android') {
      setStep('done');
      return;
    }

    (async () => {
      try {
        const alreadyVerified = await withTimeout(checkPermissionsAlreadyVerified(), 8_000);
        if (!mountedRef.current) return;
        setStep(alreadyVerified ? 'done' : 'usage');
      } catch {
        if (mountedRef.current) setStep('usage');
      }
    })();
  }, []);

  if (Platform.OS !== 'android' || step === 'done') {
    return <>{children}</>;
  }

  if (step === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={styles.loadingText}>Setting up your profile…</Text>
      </View>
    );
  }

  if (step === 'syncing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={styles.loadingText}>Syncing your focus profile…</Text>
        <Text style={styles.loadingSubtext}>Fetching app usage data</Text>
      </View>
    );
  }

  if (step === 'usage') {
    return (
      <PermissionScreen
        stepNum={1}
        icon="bar-chart-2"
        iconColor={Colors.warning}
        iconBg={Colors.warningMuted}
        title="Usage Access Required"
        description={
          'FocusGuard needs Android\'s "Usage Access" permission to track which apps you\'re using and sync real data to your focus profile.\n\nWithout this, no usage stats can be collected.'
        }
        openLabel="Open Usage Access Settings"
        onOpen={() => openUsageAccessSettings()}
        onContinue={async () => {
          await new Promise<void>(r => setTimeout(r, 500));
          return withTimeout(isUsagePermissionGranted(), 10_000);
        }}
        onGranted={() => { if (mountedRef.current) setStep('overlay'); }}
        errorMessage="Data sync failed. Please ensure the Usage Access permission is granted so we can set up your focus profile."
        steps={[
          'Tap "Open Usage Access Settings" below',
          'Find FocusGuard in the list',
          'Toggle "Permit usage access" ON',
          'Return here — the app detects it automatically',
        ]}
        mountedRef={mountedRef}
      />
    );
  }

  // step === 'overlay'
  return (
    <PermissionScreen
      stepNum={2}
      icon="layers"
      iconColor={Colors.accent}
      iconBg={Colors.accentMuted}
      title="Overlay Permission Required"
      description={
        'FocusGuard needs the "Display Over Other Apps" permission to show a blocking screen when you open a restricted app.\n\nThis data is synced to your focus profile on Supabase.'
      }
      openLabel="Open Overlay Settings"
      onOpen={() => openOverlaySettings()}
      onContinue={async () => {
        await new Promise<void>(r => setTimeout(r, 500));
        return withTimeout(checkOverlayPermission(), 10_000);
      }}
      onGranted={async () => {
        if (!mountedRef.current) return;
        setStep('syncing');
        await initializeProfile();
        if (mountedRef.current) setStep('done');
      }}
      errorMessage="Data sync failed. Please ensure the Overlay permission is granted so we can set up your focus profile."
      steps={[
        'Tap "Open Overlay Settings" below',
        'Find FocusGuard in the list',
        'Toggle "Allow display over other apps" ON',
        'Return here — the app detects it automatically',
      ]}
      mountedRef={mountedRef}
    />
  );
}

// ─── PermissionScreen ─────────────────────────────────────────────────────────

interface PermissionScreenProps {
  stepNum: number;
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  openLabel: string;
  onOpen: () => void;
  /** Called when user taps Continue. Must resolve to boolean (granted?). */
  onContinue: () => Promise<boolean>;
  /** Called when onContinue returns true. May be async (e.g. Supabase sync). */
  onGranted: () => void | Promise<void>;
  errorMessage: string;
  steps: string[];
  mountedRef: React.MutableRefObject<boolean>;
}

function PermissionScreen({
  stepNum,
  icon,
  iconColor,
  iconBg,
  title,
  description,
  openLabel,
  onOpen,
  onContinue,
  onGranted,
  errorMessage,
  steps,
  mountedRef,
}: PermissionScreenProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [denied, setDenied] = useState(false);

  // FIX: use a ref to track isChecking so the AppState listener always
  // has the latest value without needing to recreate runCheck on every render.
  const isCheckingRef = useRef(false);

  // ── Native check helper (shared by button + AppState) ──────────────────────
  const runCheck = useCallback(async () => {
    // FIX: use isCheckingRef instead of isChecking to avoid stale closure
    if (!mountedRef.current || isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);
    setDenied(false);
    try {
      const granted = await onContinue();
      if (!mountedRef.current) return;
      if (granted) {
        await onGranted();
      } else {
        setDenied(true);
      }
    } catch {
      if (mountedRef.current) setDenied(true);
    } finally {
      // FIX: reset both ref and state
      isCheckingRef.current = false;
      if (mountedRef.current) setIsChecking(false);
    }
  // FIX: removed isChecking from dependency array — it caused runCheck to be
  // recreated on every render, which made the AppState listener hold a stale
  // reference and prevented navigation after granting permission.
  }, [onContinue, onGranted, mountedRef]);

  // ── AppState listener: re-check 500 ms after returning from Settings ────────
  useEffect(() => {
    let prevState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (prevState !== 'active' && next === 'active') {
        setTimeout(() => {
          if (mountedRef.current) runCheck();
        }, 500);
      }
      prevState = next;
    });
    return () => sub.remove();
  }, [runCheck, mountedRef]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, stepNum >= 1 ? styles.stepDotActive : styles.stepDotDim]}>
          <Text style={styles.stepDotText}>1</Text>
        </View>
        <View style={[styles.stepLine, stepNum >= 2 ? styles.stepLineActive : {}]} />
        <View style={[styles.stepDot, stepNum >= 2 ? styles.stepDotActive : styles.stepDotDim]}>
          <Text style={styles.stepDotText}>2</Text>
        </View>
      </View>

      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={48} color={iconColor} />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{description}</Text>

      {/* Error banner */}
      {denied && (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={16} color={Colors.warning} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
        onPress={onOpen}
      >
        <Feather name="external-link" size={17} color={Colors.background} />
        <Text style={styles.openBtnText}>{openLabel}</Text>
      </Pressable>

      <Pressable
        style={[styles.continueBtn, isChecking && styles.continueBtnLoading]}
        onPress={runCheck}
        disabled={isChecking}
      >
        {isChecking ? (
          <>
            <ActivityIndicator size="small" color={Colors.background} />
            <Text style={styles.continueBtnText}>Verifying…</Text>
          </>
        ) : (
          <>
            <Text style={styles.continueBtnText}>
              {denied ? 'Try Again' : 'Continue'}
            </Text>
            <Feather name="arrow-right" size={17} color={Colors.background} />
          </>
        )}
      </Pressable>

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text,
  },
  loadingSubtext: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textTertiary,
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
    width: 60,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
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

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warningMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: '100%',
    marginBottom: 16,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.warning,
    flex: 1,
    lineHeight: 19,
  },

  openBtn: {
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
  openBtnText: {
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
    marginBottom: 24,
  },
  continueBtnLoading: {
    opacity: 0.7,
  },
  continueBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.background,
  },

  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    width: '100%',
    gap: 14,
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