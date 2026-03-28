/**
 * PermissionGate — hard-blocks the tabs from rendering until the Android
 * "Usage Access" (PACKAGE_USAGE_STATS) permission is confirmed granted.
 *
 * • Uses AppOpsManager via the native module — cannot be bypassed by returning
 *   from Settings without actually granting.
 * • Listens to AppState so it re-checks the moment the user comes back from
 *   the Android Settings page.
 * • On iOS and web the gate is transparent (always passes).
 */

import { Feather, Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { markUsageGranted } from '@/lib/PermissionService';
import { isUsagePermissionGranted, openUsageAccessSettings } from '@/lib/UsageStatsService';
import Colors from '@/constants/colors';

interface PermissionGateProps {
  children: React.ReactNode;
}

export function PermissionGate({ children }: PermissionGateProps) {
  const [checking, setChecking] = useState(true);
  const [granted, setGranted] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const ok = await isUsagePermissionGranted();
      if (ok) await markUsageGranted();
      setGranted(ok);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setGranted(true);
      setChecking(false);
      return;
    }

    check();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (Platform.OS !== 'android' || granted) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={styles.checkingText}>Verifying permissions…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="shield-half" size={72} color={Colors.warning} />
      </View>

      <Text style={styles.title}>Usage Access Required</Text>
      <Text style={styles.body}>
        FocusGuard needs Android's "Usage Access" permission to read which apps
        are running and how long you've used them. Without it, the dashboard
        can only show placeholder data.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
        onPress={() => openUsageAccessSettings()}
      >
        <Feather name="settings" size={18} color={Colors.background} />
        <Text style={styles.primaryBtnText}>Open Usage Access Settings</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.75 }]}
        onPress={check}
      >
        <Feather name="refresh-cw" size={16} color={Colors.accent} />
        <Text style={styles.secondaryBtnText}>I've granted it — check again</Text>
      </Pressable>

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>How to grant it:</Text>
        {[
          'Tap "Open Usage Access Settings" above',
          'Find FocusGuard in the list',
          'Toggle "Permit usage access" ON',
          'Return here — the dashboard loads automatically',
        ].map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: Colors.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  checkingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 28,
  },
  secondaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.accent,
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
    fontSize: 13,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
