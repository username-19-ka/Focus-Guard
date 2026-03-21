import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import Colors from '@/constants/colors';

const { width: W } = Dimensions.get('window');

const MOCK_APPS = [
  { name: 'Instagram', icon: 'logo-instagram', color: '#E1306C', usage: 87, limit: 60 },
  { name: 'TikTok', icon: 'logo-tiktok', color: '#010101', usage: 45, limit: 30 },
  { name: 'Twitter', icon: 'logo-twitter', color: '#1DA1F2', usage: 28, limit: 45 },
  { name: 'YouTube', icon: 'logo-youtube', color: '#FF0000', usage: 62, limit: 90 },
];

const MOCK_STATS = {
  unlockAttempts: 3,
  blockedSessions: 12,
  focusMinutes: 148,
  streak: 4,
};

function StatCard({ icon, value, label, color = Colors.accent }: {
  icon: string; value: string | number; label: string; color?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '22' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AppUsageRow({ app }: { app: typeof MOCK_APPS[0] }) {
  const pct = Math.min(app.usage / app.limit, 1);
  const over = app.usage > app.limit;
  const barColor = over ? Colors.danger : pct > 0.8 ? Colors.warning : Colors.accent;

  return (
    <View style={styles.appRow}>
      <View style={[styles.appIconCircle, { backgroundColor: app.color + '22' }]}>
        <Ionicons name={app.icon as any} size={20} color={app.color} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.appRowTop}>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={[styles.appUsage, over && { color: Colors.danger }]}>
            {app.usage}m / {app.limit}m
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(pct * 100, 100)}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    </View>
  );
}

function BlockButton() {
  const scale = useSharedValue(1);
  const [active, setActive] = useState(false);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const toggle = () => {
    scale.value = withSpring(0.93, { damping: 15 }, () => { scale.value = withSpring(1, { damping: 15 }); });
    setActive(v => !v);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Pressable onPress={toggle}>
      <Animated.View style={[styles.blockBtn, active && styles.blockBtnActive, animStyle]}>
        <Ionicons name={active ? 'shield-checkmark' : 'shield-outline'} size={22} color={active ? Colors.background : Colors.accent} />
        <View>
          <Text style={[styles.blockBtnTitle, active && { color: Colors.background }]}>
            {active ? 'Focus Mode ON' : 'Focus Mode OFF'}
          </Text>
          <Text style={[styles.blockBtnSub, active && { color: Colors.background + 'BB' }]}>
            {active ? 'All limits active' : 'Tap to activate all limits'}
          </Text>
        </View>
        <View style={[styles.blockTogglePill, active && styles.blockTogglePillActive]}>
          <View style={[styles.blockToggleDot, active && styles.blockToggleDotActive]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [wallOfShame, setWallOfShame] = useState(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    AsyncStorage.getItem('wallOfShameCount').then(v => {
      if (v) setWallOfShame(parseInt(v, 10));
    });
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await signOut();
    router.replace('/auth');
  };

  return (
    <ScrollView
      style={[styles.container]}
      contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Good focus,</Text>
          <Text style={styles.email}>{user?.email?.split('@')[0] ?? 'User'}</Text>
        </View>
        <Pressable onPress={handleSignOut} style={styles.signOutBtn} hitSlop={8}>
          <Feather name="log-out" size={20} color={Colors.textTertiary} />
        </Pressable>
      </View>

      <BlockButton />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today's Stats</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard icon="shield" value={MOCK_STATS.blockedSessions} label="Blocked" color={Colors.accent} />
        <StatCard icon="clock" value={`${MOCK_STATS.focusMinutes}m`} label="Focus Time" color={Colors.blue} />
        <StatCard icon="zap" value={`${MOCK_STATS.streak}d`} label="Streak" color={Colors.warning} />
        <StatCard icon="x-circle" value={wallOfShame + MOCK_STATS.unlockAttempts} label="Unlocks" color={Colors.danger} />
      </View>

      <View style={styles.shameCard}>
        <View style={styles.shameLeft}>
          <Ionicons name="flame" size={20} color={Colors.danger} />
          <View>
            <Text style={styles.shameTitle}>Wall of Shame</Text>
            <Text style={styles.shameDesc}>Total unlock completions today</Text>
          </View>
        </View>
        <Text style={styles.shameCount}>{wallOfShame + MOCK_STATS.unlockAttempts}</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>App Usage Today</Text>
        <Pressable onPress={() => router.push('/(tabs)/limits')} hitSlop={8}>
          <Text style={styles.seeAll}>Manage</Text>
        </Pressable>
      </View>

      <View style={styles.appsCard}>
        {MOCK_APPS.map((app, i) => (
          <React.Fragment key={app.name}>
            <AppUsageRow app={app} />
            {i < MOCK_APPS.length - 1 && <View style={styles.rowDivider} />}
          </React.Fragment>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Active Focus Zone</Text>
        <Pressable onPress={() => router.push('/(tabs)/focus-zones')} hitSlop={8}>
          <Text style={styles.seeAll}>Manage</Text>
        </Pressable>
      </View>

      <View style={styles.zoneCard}>
        <View style={[styles.zoneIndicator, { backgroundColor: Colors.accent }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.zoneName}>Work Hours</Text>
          <Text style={styles.zoneTime}>Mon–Fri  ·  9:00 AM – 5:00 PM</Text>
        </View>
        <View style={styles.zoneBadge}>
          <Text style={styles.zoneBadgeText}>Active</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  greeting: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  email: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  signOutBtn: {
    padding: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
  },
  blockBtn: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  blockBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  blockBtnTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  blockBtnSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  blockTogglePill: {
    marginLeft: 'auto',
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  blockTogglePillActive: { backgroundColor: Colors.accentDark },
  blockToggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textSecondary,
  },
  blockToggleDotActive: {
    backgroundColor: Colors.background,
    alignSelf: 'flex-end',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.text,
  },
  seeAll: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.accent,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: (W - 52) / 2,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 6,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  shameCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: Colors.dangerMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shameLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  shameTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.danger },
  shameDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.danger + 'AA' },
  shameCount: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.danger },
  appsCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  appIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  appUsage: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  rowDivider: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: 66 },
  zoneCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  zoneIndicator: { width: 4, height: 36, borderRadius: 2 },
  zoneName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  zoneTime: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  zoneBadge: {
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  zoneBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.accent },
});
