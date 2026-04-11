/**
 * PermissionGate — shows informational permission screens for both required
 * Android permissions, but never blocks on verification.  The user can open
 * the relevant Settings page, grant the permission, then tap Continue at any
 * time to proceed into the app.
 *
 * On iOS and web both screens are skipped entirely.
 */

import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { openOverlaySettings } from '@/lib/PermissionService';
import { openUsageAccessSettings } from '@/lib/UsageStatsService';
import Colors from '@/constants/colors';

type Step = 'checking' | 'usage' | 'overlay' | 'done';

interface PermissionGateProps {
  children: React.ReactNode;
}

export function PermissionGate({ children }: PermissionGateProps) {
  const [step, setStep] = useState<Step>('checking');

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setStep('done');
      return;
    }
    // Brief pause so the splash has time to hide before showing the first screen
    const t = setTimeout(() => setStep('usage'), 300);
    return () => clearTimeout(t);
  }, []);

  if (Platform.OS !== 'android' || step === 'done') {
    return <>{children}</>;
  }

  if (step === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (step === 'usage') {
    return (
      <PermissionScreen
        icon="bar-chart-2"
        iconColor={Colors.warning}
        iconBg={Colors.warningMuted}
        stepNum={1}
        title="Usage Access Required"
        description={
          'FocusGuard needs Android\'s "Usage Access" permission to see which apps you\'re using and for how long.\n\nTap the button below, find FocusGuard in the list, and enable "Permit usage access".'
        }
        openLabel="Open Usage Access Settings"
        onOpen={() => openUsageAccessSettings()}
        onContinue={() => setStep('overlay')}
        steps={[
          'Tap "Open Usage Access Settings" below',
          'Find FocusGuard in the list',
          'Toggle "Permit usage access" ON',
          'Return here and tap Continue',
        ]}
      />
    );
  }

  // overlay step
  return (
    <PermissionScreen
      icon="layers"
      iconColor={Colors.accent}
      iconBg={Colors.accentMuted}
      stepNum={2}
      title="Overlay Permission Required"
      description={
        'FocusGuard needs the "Display Over Other Apps" permission to show a blocking screen when you open a restricted app.\n\nTap the button below, find FocusGuard, and enable the toggle.'
      }
      openLabel="Open Overlay Settings"
      onOpen={() => openOverlaySettings()}
      onContinue={() => setStep('done')}
      steps={[
        'Tap "Open Overlay Settings" below',
        'Find FocusGuard in the list',
        'Toggle "Allow display over other apps" ON',
        'Return here and tap Continue',
      ]}
    />
  );
}

function PermissionScreen({
  icon,
  iconColor,
  iconBg,
  stepNum,
  title,
  description,
  openLabel,
  onOpen,
  onContinue,
  steps,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconColor: string;
  iconBg: string;
  stepNum: number;
  title: string;
  description: string;
  openLabel: string;
  onOpen: () => void;
  onContinue: () => void;
  steps: string[];
}) {
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

      <Pressable
        style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
        onPress={onOpen}
      >
        <Feather name="external-link" size={17} color={Colors.background} />
        <Text style={styles.openBtnText}>{openLabel}</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.85 }]}
        onPress={onContinue}
      >
        <Text style={styles.continueBtnText}>Continue</Text>
        <Feather name="arrow-right" size={17} color={Colors.background} />
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
    marginBottom: 32,
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
