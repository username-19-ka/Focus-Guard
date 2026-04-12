/**
 * PermissionGate
 *
 * Shows Usage Access and Overlay permission screens. The native check is
 * attempted on Continue but always returns true regardless of the OS result —
 * this prevents Xiaomi/slow-Android devices from hard-blocking the user.
 * initializeProfile() is fired without awaiting on the final step; the user
 * reaches the Dashboard after an 800 ms delay.
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

type GateStep = 'loading' | 'usage' | 'overlay' | 'done';

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

  // On boot: skip gate if this account already verified permissions in Supabase
  useEffect(() => {
    if (Platform.OS !== 'android') {
      setStep('done');
      return;
    }
    (async () => {
      try {
        const verified = await withTimeout(checkPermissionsAlreadyVerified(), 8_000);
        if (mountedRef.current) setStep(verified ? 'done' : 'usage');
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
          // Attempt native check but always return true — OS may be slow to report
          try {
            await new Promise<void>(r => setTimeout(r, 500));
            await withTimeout(isUsagePermissionGranted(), 10_000);
          } catch {}
          return true;
        }}
        onGranted={() => { if (mountedRef.current) setStep('overlay'); }}
        steps={[
          'Tap "Open Usage Access Settings" below',
          'Find FocusGuard in the list',
          'Toggle "Permit usage access" ON',
          'Return here and tap Continue',
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
        'FocusGuard needs the "Display Over Other Apps" permission to show a blocking screen when you open a restricted app.\n\nThis data is synced to your focus profile.'
      }
      openLabel="Open Overlay Settings"
      onOpen={() => openOverlaySettings()}
      onContinue={async () => {
        // Attempt native check but always return true — OS may be slow to report
        try {
          await new Promise<void>(r => setTimeout(r, 500));
          await withTimeout(checkOverlayPermission(), 10_000);
        } catch {}
        return true;
      }}
      onGranted={() => {
        if (!mountedRef.current) return;
        // Fire profile init without awaiting — advance to Dashboard after 800 ms
        initializeProfile();
        setTimeout(() => { if (mountedRef.current) setStep('done'); }, 800);
      }}
      steps={[
        'Tap "Open Overlay Settings" below',
        'Find FocusGuard in the list',
        'Toggle "Allow display over other apps" ON',
        'Return here and tap Continue',
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
  onContinue: () => Promise<boolean>;
  onGranted: () => void;
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
  steps,
  mountedRef,
}: PermissionScreenProps) {
  const [isChecking, setIsChecking] = useState(false);

  const runCheck = useCallback(async () => {
    if (!mountedRef.current || isChecking) return;
    setIsChecking(true);
    try {
      const granted = await onContinue();
      if (mountedRef.current && granted) onGranted();
    } catch {
      if (mountedRef.current) onGranted(); // always advance on error
    } finally {
      if (mountedRef.current) setIsChecking(false);
    }
  }, [isChecking, onContinue, onGranted, mountedRef]);

  // AppState: re-check 500 ms after returning from Settings
  useEffect(() => {
    let prev: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (prev !== 'active' && next === 'active') {
        setTimeout(() => { if (mountedRef.current) runCheck(); }, 500);
      }
      prev = next;
    });
    return () => sub.remove();
  }, [runCheck, mountedRef]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
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

      <Pressable
        style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
        onPress={onOpen}
      >
        <Feather name="external-link" size={17} color={Colors.background} />
        <Text style={styles.openBtnText}>{openLabel}</Text>
      </Pressable>

      <Pressable
        style={[styles.continueBtn, isChecking && { opacity: 0.7 }]}
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
            <Text style={styles.continueBtnText}>Continue</Text>
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

  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 60,
  },

  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  stepDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: Colors.accent },
  stepDotDim: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  stepDotText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.background },
  stepLine: { width: 60, height: 2, backgroundColor: Colors.border, marginHorizontal: 8 },
  stepLineActive: { backgroundColor: Colors.accent },

  iconWrap: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },

  title: {
    fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.text,
    textAlign: 'center', marginBottom: 14,
  },
  body: {
    fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 24, marginBottom: 32,
  },

  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 24,
    width: '100%', justifyContent: 'center', marginBottom: 12,
  },
  openBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.background },

  continueBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accentDark, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 24,
    width: '100%', justifyContent: 'center', marginBottom: 24,
  },
  continueBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.background },

  stepsCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 18, width: '100%', gap: 14,
  },
  stepsTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  stepNum: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.accent },
  stepText: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary,
    flex: 1, lineHeight: 20,
  },
});
