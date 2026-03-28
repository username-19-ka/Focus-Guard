import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useDashboardStore, MappedApp } from '@/store/dashboardStore';
import { openUsageAccessSettings } from '@/lib/UsageStatsService';
import FocusRing from '@/components/FocusRing';
import WeeklyBarChart from '@/components/WeeklyBarChart';
import Colors from '@/constants/colors';

const { width: W } = Dimensions.get('window');

function minutesToDisplay(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ImpactCards() {
  const { timeSavedMinutes, focusRatioPercent, streakDays } = useDashboardStore();

  return (
    <View style={styles.impactRow}>
      <View style={[styles.impactCard, styles.heroCard]}>
        <Text style={styles.impactCardLabel}>Time Saved Today</Text>
        <Text style={styles.heroValue}>{minutesToDisplay(timeSavedMinutes)}</Text>
        <Text style={styles.heroSub}>vs. your old habits</Text>
        <View style={styles.heroBar}>
          <View style={[styles.heroBarFill, { width: `${Math.min((timeSavedMinutes / 240) * 100, 100)}%` }]} />
        </View>
      </View>

      <View style={styles.rightColumn}>
        <View style={[styles.impactCard, styles.ringCard]}>
          <FocusRing
            percent={focusRatioPercent}
            size={80}
            strokeWidth={8}
            label="Focus Ratio"
            sublabel="of day in zones"
          />
        </View>

        <View style={[styles.impactCard, styles.streakCard]}>
          <Feather name="zap" size={18} color={Colors.warning} />
          <Text style={styles.streakValue}>{streakDays}</Text>
          <Text style={styles.streakLabel}>day streak</Text>
        </View>
      </View>
    </View>
  );
}

function WeeklySection() {
  const { weeklyData, weekLabels, timeSavedMinutes } = useDashboardStore();
  const totalWeekMins = weeklyData.reduce((a, b) => a + b, 0) + timeSavedMinutes;

  return (
    <View style={styles.weekCard}>
      <View style={styles.weekHeader}>
        <View>
          <Text style={styles.sectionTitle}>Weekly Activity</Text>
          <Text style={styles.weekSubtitle}>{minutesToDisplay(totalWeekMins)} saved this week</Text>
        </View>
        <View style={styles.weekBadge}>
          <Feather name="trending-up" size={13} color={Colors.accent} />
          <Text style={styles.weekBadgeText}>+12%</Text>
        </View>
      </View>
      <WeeklyBarChart data={[...weeklyData.slice(0, 6), timeSavedMinutes]} labels={weekLabels} height={90} />
    </View>
  );
}

function AppUsageRow({ app }: { app: MappedApp }) {
  const pct = Math.min(app.usage / Math.max(app.limit, 1), 1);
  const over = app.usage > app.limit;
  const barColor = over ? Colors.danger : pct > 0.8 ? Colors.warning : Colors.accent;

  return (
    <View style={styles.appRow}>
      <View style={[styles.appIconCircle, { backgroundColor: app.color + '22' }]}>
        <Ionicons name={app.icon as any} size={20} color={app.color} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.appRowTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.appName}>{app.name}</Text>
            {app.isRealData && (
              <View style={styles.liveIndicator}>
                <Text style={styles.liveIndicatorText}>LIVE</Text>
              </View>
            )}
          </View>
          <Text style={[styles.appUsage, over && { color: Colors.danger }]}>
            {minutesToDisplay(app.usage)} / {app.limit}m
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(pct * 100, 100)}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const {
    init, syncFromSupabase, getShareText, isSyncing,
    topApps, usagePermissionGranted, isLoadingUsage, refreshUsageStats,
  } = useDashboardStore();
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    init().then(() => {
      if (user?.id) syncFromSupabase(user.id);
    });
  }, [user?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUsageStats();
    });
    return () => sub.remove();
  }, [refreshUsageStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      init(),
      refreshUsageStats(),
      user?.id ? syncFromSupabase(user.id) : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [user?.id]);

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({ message: getShareText() });
    } catch {}
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/auth');
        },
      },
    ]);
  };

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? 'Good morning,' : greetingHour < 18 ? 'Good afternoon,' : 'Good evening,';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing || isSyncing} onRefresh={onRefresh} tintColor={Colors.accent} />
      }
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.username}>{user?.email?.split('@')[0] ?? 'User'}</Text>
        </View>
        <View style={styles.topBarActions}>
          <Pressable onPress={handleShare} style={styles.shareBtn} hitSlop={8}>
            <Feather name="share-2" size={18} color={Colors.accent} />
          </Pressable>
          <Pressable onPress={handleSignOut} style={styles.signOutBtn} hitSlop={8}>
            <Feather name="log-out" size={18} color={Colors.textTertiary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionSpacer}>
        <Text style={styles.sectionTitle}>Today's Impact</Text>
      </View>
      <ImpactCards />

      <WeeklySection />

      <View style={[styles.sectionSpacer, styles.sectionSpacerRow]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.sectionTitle}>App Usage Today</Text>
          {isLoadingUsage && (
            <View style={styles.loadingDot} />
          )}
        </View>
        <Pressable onPress={() => router.push('/(tabs)/limits')} hitSlop={8}>
          <Text style={styles.seeAll}>Manage</Text>
        </Pressable>
      </View>

      {Platform.OS === 'android' && !usagePermissionGranted && (
        <Pressable
          style={styles.permissionBanner}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await openUsageAccessSettings();
            setTimeout(() => refreshUsageStats(), 1500);
          }}
        >
          <Ionicons name="shield-half" size={18} color={Colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.permissionBannerTitle}>Usage Access required for real data</Text>
            <Text style={styles.permissionBannerSub}>Tap to open Android settings and grant access</Text>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.warning} />
        </Pressable>
      )}

      <View style={styles.appsCard}>
        {topApps.map((app, i) => (
          <React.Fragment key={app.packageName}>
            <AppUsageRow app={app} />
            {i < topApps.length - 1 && <View style={styles.rowDivider} />}
          </React.Fragment>
        ))}
      </View>

      <Pressable style={styles.bragBtn} onPress={handleShare}>
        <Feather name="share-2" size={16} color={Colors.background} />
        <Text style={styles.bragBtnText}>Brag to Friends</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  greeting: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  username: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  shareBtn: {
    padding: 9,
    backgroundColor: Colors.accentMuted,
    borderRadius: 10,
  },
  signOutBtn: {
    padding: 9,
    backgroundColor: Colors.surface,
    borderRadius: 10,
  },
  sectionSpacer: {
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionSpacerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  impactRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  impactCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  heroCard: {
    flex: 1,
    gap: 4,
  },
  heroValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    marginTop: 2,
  },
  impactCardLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  heroBar: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  heroBarFill: {
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  rightColumn: {
    gap: 12,
  },
  ringCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  streakCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 2,
  },
  streakValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  streakLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
  },
  weekCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 16,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  weekSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  weekBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  weekBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.accent,
  },
  appsCard: {
    marginHorizontal: 20,
    marginBottom: 16,
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
  appRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  appUsage: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  liveIndicator: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  liveIndicatorText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  loadingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    opacity: 0.7,
  },
  permissionBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: Colors.warningMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  permissionBannerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.warning,
  },
  permissionBannerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.warning + 'BB',
    marginTop: 1,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  rowDivider: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: 66 },
  bragBtn: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  bragBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.background,
  },
});
