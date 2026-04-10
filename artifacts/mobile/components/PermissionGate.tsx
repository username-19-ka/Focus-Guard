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
 * Re-checks automatically every time the user returns from Android Settings.
 */

import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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

export function PermissionGate({ children }: PermissionGateProps) {
  const [gateState, setGateState] = useState<GateState>('checking');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * Full permission check.
   *
   * @param silent  When true the gate does NOT flip to the 'checking' spinner
   *                while running — used by the "Continue" button so the current
   *                screen stays visible with its own button-level indicator.
   *                When false (default) the full-screen spinner is shown.
   */
  const check = useCallback(async (silent = false) => {
    if (!mountedRef.current) return;
    if (!silent) setGateState('checking');

    try {
      const usageOk = await isUsagePermissionGranted();
      if (!mountedRef.current) return;

      if (!usageOk) {
        setGateState('need_usage');
        return;
      }

      try { await markUsageGranted(); } catch {}

      // checkOverlayPermission() calls Settings.canDrawOverlays() via the
      // native bridge first; falls back to AsyncStorage in Expo Go / web.
      const overlayOk = await checkOverlayPermission();
      if (!mountedRef.current) return;

      if (!overlayOk) {
        setGateState('need_overlay');
        return;
      }

      setGateState('granted');
    } catch {
      if (mountedRef.current) setGateState('need_usage');
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setGateState('granted');
      return;
    }

    check();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
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
  onRecheck: () => Promise<void>;
  steps: string[];
}) {
  const [isChecking, setIsChecking] = useState(false);

  const handleContinue = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      await onRecheck();
    } finally {
      setIsChecking(false);
    }
  };

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

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={onPrimary}
      >
        <Feather name="external-link" size={17} color={Colors.background} />
        <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
      </Pressable>

      <Pressable
        style={[styles.continueBtn, isChecking && styles.continueBtnChecking]}
        onPress={handleContinue}
        disabled={isChecking}
      >
        {isChecking ? (
          <ActivityIndicator size="small" color={Colors.background} />
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
    marginBottom: 32,
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
    marginBottom: 24,
  },
  continueBtnChecking: {
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
