import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';

type AppConfig = {
  id: string;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  expanded: boolean;
  lockDuration: number;
  unlockGoals: number;
  unlockTimeLimit: number;
};

const DURATION_OPTIONS = [5, 10, 15, 30, 60];
const GOAL_OPTIONS = [1, 2, 3, 5, 10];
const TIME_LIMIT_OPTIONS = [15, 30, 45, 60, 90, 120];

const DEFAULT_APPS: AppConfig[] = [
  { id: 'instagram', name: 'Instagram', icon: 'logo-instagram', color: '#E1306C', enabled: true, expanded: false, lockDuration: 30, unlockGoals: 3, unlockTimeLimit: 60 },
  { id: 'tiktok', name: 'TikTok', icon: 'logo-tiktok', color: '#010101', enabled: true, expanded: false, lockDuration: 15, unlockGoals: 2, unlockTimeLimit: 30 },
  { id: 'twitter', name: 'Twitter', icon: 'logo-twitter', color: '#1DA1F2', enabled: false, expanded: false, lockDuration: 30, unlockGoals: 3, unlockTimeLimit: 45 },
  { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', color: '#FF0000', enabled: true, expanded: false, lockDuration: 60, unlockGoals: 5, unlockTimeLimit: 90 },
  { id: 'reddit', name: 'Reddit', icon: 'logo-reddit', color: '#FF4500', enabled: false, expanded: false, lockDuration: 30, unlockGoals: 2, unlockTimeLimit: 60 },
  { id: 'facebook', name: 'Facebook', icon: 'logo-facebook', color: '#1877F2', enabled: false, expanded: false, lockDuration: 30, unlockGoals: 3, unlockTimeLimit: 60 },
];

function PickerRow({ label, value, options, onChange }: {
  label: string; value: number; options: number[]; onChange: (v: number) => void;
}) {
  const idx = options.indexOf(value);

  const cycle = (dir: 1 | -1) => {
    const next = (idx + dir + options.length) % options.length;
    onChange(options[next]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.pickerRow}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <View style={styles.pickerControls}>
        <Pressable onPress={() => cycle(-1)} hitSlop={8}>
          <Feather name="minus-circle" size={20} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.pickerValue}>{value}{label.includes('Goals') ? '' : 'm'}</Text>
        <Pressable onPress={() => cycle(1)} hitSlop={8}>
          <Feather name="plus-circle" size={20} color={Colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function AppCard({ app, onToggle, onExpand, onUpdate }: {
  app: AppConfig;
  onToggle: () => void;
  onExpand: () => void;
  onUpdate: (field: keyof AppConfig, val: any) => void;
}) {
  const chevronRotation = useSharedValue(app.expanded ? 180 : 0);
  chevronRotation.value = withSpring(app.expanded ? 180 : 0, { damping: 18 });

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  return (
    <View style={styles.appCard}>
      <Pressable style={styles.appCardHeader} onPress={onExpand}>
        <View style={[styles.appCardIcon, { backgroundColor: app.color + '22' }]}>
          <Ionicons name={app.icon as any} size={22} color={app.color} />
        </View>
        <Text style={styles.appCardName}>{app.name}</Text>
        <Pressable onPress={onToggle} style={styles.toggleWrap} hitSlop={6}>
          <View style={[styles.toggle, app.enabled && styles.toggleOn]}>
            <View style={[styles.toggleThumb, app.enabled && styles.toggleThumbOn]} />
          </View>
        </Pressable>
        <Animated.View style={chevronStyle}>
          <Feather name="chevron-down" size={18} color={Colors.textTertiary} />
        </Animated.View>
      </Pressable>

      {app.expanded && (
        <View style={styles.expansionPanel}>
          <View style={styles.expansionDivider} />
          <PickerRow
            label="Lock Duration"
            value={app.lockDuration}
            options={DURATION_OPTIONS}
            onChange={v => onUpdate('lockDuration', v)}
          />
          <View style={styles.internalDivider} />
          <PickerRow
            label="Unlock Goals"
            value={app.unlockGoals}
            options={GOAL_OPTIONS}
            onChange={v => onUpdate('unlockGoals', v)}
          />
          <View style={styles.internalDivider} />
          <PickerRow
            label="Unlock Time Limit"
            value={app.unlockTimeLimit}
            options={TIME_LIMIT_OPTIONS}
            onChange={v => onUpdate('unlockTimeLimit', v)}
          />
        </View>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppConfig[]>(DEFAULT_APPS);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    AsyncStorage.getItem('appConfigs').then(v => {
      if (v) {
        try { setApps(JSON.parse(v)); } catch {}
      }
    });
  }, []);

  const save = (updated: AppConfig[]) => {
    setApps(updated);
    AsyncStorage.setItem('appConfigs', JSON.stringify(updated));
  };

  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    save(apps.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const expand = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    save(apps.map(a => a.id === id ? { ...a, expanded: !a.expanded } : a));
  };

  const update = (id: string, field: keyof AppConfig, val: any) => {
    save(apps.map(a => a.id === id ? { ...a, [field]: val } : a));
  };

  const enabledCount = apps.filter(a => a.enabled).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Managed Apps</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{enabledCount} active</Text>
        </View>
      </View>

      <Text style={styles.pageDesc}>
        Toggle apps to block them when limits are hit. Expand each app to configure lock duration, unlock goals, and time limits.
      </Text>

      <View style={styles.appList}>
        {apps.map(app => (
          <AppCard
            key={app.id}
            app={app}
            onToggle={() => toggle(app.id)}
            onExpand={() => expand(app.id)}
            onUpdate={(field, val) => update(app.id, field, val)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  countBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.accent },
  pageDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  appList: { paddingHorizontal: 16, gap: 8 },
  appCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  appCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  appCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appCardName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  toggleWrap: { marginRight: 6 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: Colors.accent },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textSecondary,
  },
  toggleThumbOn: {
    backgroundColor: Colors.background,
    alignSelf: 'flex-end',
  },
  expansionDivider: { height: 1, backgroundColor: Colors.borderSubtle },
  expansionPanel: { paddingBottom: 4 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  pickerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pickerValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
    minWidth: 44,
    textAlign: 'center',
  },
  internalDivider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 16,
  },
});
