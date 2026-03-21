import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { BlockOverlay } from '@/components/BlockOverlay';

const { width: W } = Dimensions.get('window');

type AppLimit = {
  id: string;
  name: string;
  icon: string;
  iconColor: string;
  dailyLimitMin: number;
  usedMin: number;
};

const DEFAULT_LIMITS: AppLimit[] = [
  { id: 'instagram', name: 'Instagram', icon: 'logo-instagram', iconColor: '#E1306C', dailyLimitMin: 60, usedMin: 87 },
  { id: 'tiktok', name: 'TikTok', icon: 'logo-tiktok', iconColor: '#010101', dailyLimitMin: 30, usedMin: 45 },
  { id: 'twitter', name: 'Twitter', icon: 'logo-twitter', iconColor: '#1DA1F2', dailyLimitMin: 45, usedMin: 28 },
  { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', iconColor: '#FF0000', dailyLimitMin: 90, usedMin: 62 },
  { id: 'reddit', name: 'Reddit', icon: 'logo-reddit', iconColor: '#FF4500', dailyLimitMin: 30, usedMin: 14 },
];

const LIMIT_STEPS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

function LimitCard({ app, onTest, onAdjust }: {
  app: AppLimit;
  onTest: () => void;
  onAdjust: (newLimit: number) => void;
}) {
  const pct = Math.min(app.usedMin / app.dailyLimitMin, 1);
  const over = app.usedMin >= app.dailyLimitMin;
  const remaining = Math.max(app.dailyLimitMin - app.usedMin, 0);
  const barColor = over ? Colors.danger : pct > 0.8 ? Colors.warning : Colors.accent;

  const stepIdx = LIMIT_STEPS.indexOf(app.dailyLimitMin);

  const adjust = (dir: 1 | -1) => {
    const nextIdx = Math.max(0, Math.min(LIMIT_STEPS.length - 1, stepIdx + dir));
    onAdjust(LIMIT_STEPS[nextIdx]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.limitCard}>
      <View style={styles.cardTop}>
        <View style={[styles.appIcon, { backgroundColor: app.iconColor + '22' }]}>
          <Ionicons name={app.icon as any} size={22} color={app.iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={[styles.status, { color: over ? Colors.danger : Colors.textSecondary }]}>
            {over ? 'Limit reached' : `${remaining}m remaining`}
          </Text>
        </View>
        {over && (
          <Pressable
            style={({ pressed }) => [styles.testBlockBtn, pressed && { opacity: 0.8 }]}
            onPress={onTest}
          >
            <Feather name="lock" size={13} color={Colors.danger} />
            <Text style={styles.testBlockText}>Test</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, {
            width: `${Math.min(pct * 100, 100)}%`,
            backgroundColor: barColor,
          }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressUsed}>{app.usedMin}m used</Text>
          <Text style={styles.progressTotal}>/ {app.dailyLimitMin}m</Text>
        </View>
      </View>

      <View style={styles.sliderSection}>
        <Text style={styles.sliderLabel}>Daily Limit</Text>
        <View style={styles.sliderControls}>
          <Pressable onPress={() => adjust(-1)} hitSlop={8} disabled={stepIdx <= 0}>
            <View style={[styles.adjustBtn, stepIdx <= 0 && { opacity: 0.3 }]}>
              <Feather name="minus" size={14} color={Colors.text} />
            </View>
          </Pressable>
          <View style={styles.limitValueWrap}>
            <Text style={styles.limitValue}>{app.dailyLimitMin}</Text>
            <Text style={styles.limitUnit}>min/day</Text>
          </View>
          <Pressable onPress={() => adjust(1)} hitSlop={8} disabled={stepIdx >= LIMIT_STEPS.length - 1}>
            <View style={[styles.adjustBtn, { backgroundColor: Colors.accentMuted }, stepIdx >= LIMIT_STEPS.length - 1 && { opacity: 0.3 }]}>
              <Feather name="plus" size={14} color={Colors.accent} />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function LimitsScreen() {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppLimit[]>(DEFAULT_LIMITS);
  const [blockerApp, setBlockerApp] = useState<string | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    AsyncStorage.getItem('appLimits').then(v => {
      if (v) { try { setApps(JSON.parse(v)); } catch {} }
    });
  }, []);

  const save = (updated: AppLimit[]) => {
    setApps(updated);
    AsyncStorage.setItem('appLimits', JSON.stringify(updated));
  };

  const totalUsed = apps.reduce((s, a) => s + a.usedMin, 0);
  const totalLimit = apps.reduce((s, a) => s + a.dailyLimitMin, 0);
  const overLimit = apps.filter(a => a.usedMin >= a.dailyLimitMin).length;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>App Limits</Text>
          <Text style={styles.pageDesc}>Daily time budgets per app</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totalUsed}m</Text>
            <Text style={styles.summaryLabel}>Total Used</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totalLimit}m</Text>
            <Text style={styles.summaryLabel}>Total Budget</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, overLimit > 0 && { color: Colors.danger }]}>{overLimit}</Text>
            <Text style={styles.summaryLabel}>Over Limit</Text>
          </View>
        </View>

        {overLimit > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={16} color={Colors.warning} />
            <Text style={styles.alertText}>
              {overLimit} app{overLimit > 1 ? 's have' : ' has'} exceeded today's limit. Tap "Test" to preview the blocker.
            </Text>
          </View>
        )}

        <View style={styles.list}>
          {apps.map(app => (
            <LimitCard
              key={app.id}
              app={app}
              onTest={() => setBlockerApp(app.name)}
              onAdjust={newLimit => save(apps.map(a => a.id === app.id ? { ...a, dailyLimitMin: newLimit } : a))}
            />
          ))}
        </View>
      </ScrollView>

      {blockerApp && (
        <BlockOverlay
          appName={blockerApp}
          onUnlocked={() => setBlockerApp(null)}
          onClose={() => setBlockerApp(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pageHeader: { paddingHorizontal: 20, paddingBottom: 16 },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  pageDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: Colors.border },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.warningMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    padding: 12,
  },
  alertText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.warning, flex: 1, lineHeight: 20 },
  list: { paddingHorizontal: 16, gap: 10 },
  limitCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  appIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  appName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  status: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 },
  testBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dangerMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  testBlockText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.danger },
  progressSection: { gap: 6 },
  progressTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressUsed: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text },
  progressTotal: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  sliderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  sliderLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  sliderControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adjustBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitValueWrap: { alignItems: 'center' },
  limitValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text },
  limitUnit: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary },
});
