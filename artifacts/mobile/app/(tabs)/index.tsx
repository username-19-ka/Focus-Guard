import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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

function FocusModeToggle() {
  const { focusModeActive, toggleFocusMode } = useDashboardStore();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.95, { damping: 15 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    toggleFocusMode();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.focusModeCard, focusModeActive && styles.focusModeCardActive, animStyle]}>
        <Ionicons
          name={focusModeActive ? 'shield-checkmark' : 'shield-outline'}
          size={22}
          color={focusModeActive ? Colors.background : Colors.accent}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.focusModeTitle, focusModeActive && { color: Colors.background }]}>
            {focusModeActive ? 'Focus Mode ON' : 'Focus Mode OFF'}
          </Text>
          <Text style={[styles.focusModeSub, focusModeActive && { color: Colors.background + 'BB' }]}>
            {focusModeActive ? 'All limits active now' : 'Tap to activate all limits'}
          </Text>
        </View>
        <View style={[styles.togglePill, focusModeActive && styles.togglePillActive]}>
          <View style={[styles.toggleDot, focusModeActive && styles.toggleDotActive]} />
        </View>
      </Animated.View>
    </Pressable>
  );
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

function WallOfShameSection() {
  const { wallOfShameToday, wallOfShameTotal, shameHistory } = useDashboardStore();
  const [expanded, setExpanded] = useState(false);
  const heightAnim = useSharedValue(0);

  const historyStyle = useAnimatedStyle(() => ({
    height: withTiming(expanded ? Math.min(shameHistory.length * 52, 200) : 0, { duration: 250 }),
    overflow: 'hidden',
  }));

  return (
    <View style={styles.shameSection}>
      <View style={styles.shameCountCard}>
        <View style={styles.shameCountLeft}>
          <View style={styles.shameIconWrap}>
            <Feather name="alert-octagon" size={20} color={Colors.danger} />
          </View>
          <View>
            <Text style={styles.shameTitle}>Wall of Shame</Text>
            <Text style={styles.shameDesc}>Hard-mode unlocks today</Text>
          </View>
        </View>
        <View style={styles.shameRight}>
          <Text style={styles.shameCount}>{wallOfShameToday}</Text>
          <Text style={styles.shameTotalLabel}>{wallOfShameTotal} total</Text>
        </View>
      </View>

      {shameHistory.length > 0 && (
        <Pressable
          style={styles.shameToggleRow}
          onPress={() => {
            setExpanded(v => !v);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          hitSlop={8}
        >
          <Text style={styles.shameToggleText}>
            {expanded ? 'Hide history' : `Show ${shameHistory.length} unlock${shameHistory.length !== 1 ? 's' : ''} today`}
          </Text>
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.danger} />
        </Pressable>
      )}

      <Animated.View style={historyStyle}>
        <ScrollView
          style={styles.historyScroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEnabled={shameHistory.length > 3}
        >
          {shameHistory.map((entry, i) => (
            <View key={entry.id} style={[styles.historyEntry, i > 0 && styles.historyEntryBorder]}>
              <View style={styles.historyDot} />
              <Text style={styles.historyApp}>{entry.app}</Text>
              <Text style={styles.historyTime}>Unlocked at {entry.time}</Text>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
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

function BeforeAfterSection() {
  const { beforeDailyMinutes, afterDailyMinutes } = useDashboardStore();
  const [view, setView] = useState<'before' | 'after'>('after');
  const reduction = Math.round((1 - afterDailyMinutes / beforeDailyMinutes) * 100);

  const beforePct = 100;
  const afterPct = (afterDailyMinutes / beforeDailyMinutes) * 100;

  return (
    <View style={styles.compareCard}>
      <View style={styles.compareHeader}>
        <Text style={styles.sectionTitle}>Before vs. After</Text>
        <View style={styles.compareToggle}>
          <Pressable
            style={[styles.compareTab, view === 'before' && styles.compareTabActive]}
            onPress={() => setView('before')}
          >
            <Text style={[styles.compareTabText, view === 'before' && styles.compareTabTextActive]}>Before</Text>
          </Pressable>
          <Pressable
            style={[styles.compareTab, view === 'after' && styles.compareTabActive]}
            onPress={() => setView('after')}
          >
            <Text style={[styles.compareTabText, view === 'after' && styles.compareTabTextActive]}>After</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.compareBody}>
        <View style={styles.compareItem}>
          <View style={styles.compareBarLabel}>
            <Text style={styles.compareBarName}>Daily usage</Text>
            <Text style={[styles.compareBarValue, { color: Colors.danger }]}>
              {minutesToDisplay(beforeDailyMinutes)}/day
            </Text>
          </View>
          <View style={styles.compareTrack}>
            <View style={[styles.compareFill, { width: `${beforePct}%`, backgroundColor: Colors.danger + '88' }]} />
          </View>
        </View>

        <View style={styles.compareItem}>
          <View style={styles.compareBarLabel}>
            <Text style={styles.compareBarName}>With FocusGuard</Text>
            <Text style={[styles.compareBarValue, { color: Colors.accent }]}>
              {minutesToDisplay(afterDailyMinutes)}/day
            </Text>
          </View>
          <View style={styles.compareTrack}>
            <View style={[styles.compareFill, { width: `${afterPct}%`, backgroundColor: Colors.accent }]} />
          </View>
        </View>

        <View style={styles.reductionBadge}>
          <Feather name="arrow-down" size={13} color={Colors.accent} />
          <Text style={styles.reductionText}>{reduction}% reduction in daily screen time</Text>
        </View>
      </View>
    </View>
  );
}

function LeaderboardSection() {
  const { globalRank, leaderboardOptIn, toggleLeaderboard } = useDashboardStore();

  return (
    <View style={styles.leaderCard}>
      <View style={styles.leaderHeader}>
        <View style={styles.leaderIconWrap}>
          <Feather name="award" size={18} color={Colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.leaderTitle}>Global Leaderboard</Text>
          <Text style={styles.leaderSub}>
            {leaderboardOptIn ? 'Your streak ranks you globally' : 'Opt in to see your rank'}
          </Text>
        </View>
        <Switch
          value={leaderboardOptIn}
          onValueChange={() => {
            toggleLeaderboard();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          trackColor={{ false: Colors.border, true: Colors.accentDark }}
          thumbColor={leaderboardOptIn ? Colors.accent : Colors.textTertiary}
        />
      </View>

      {leaderboardOptIn && globalRank != null && (
        <View style={styles.rankRow}>
          <View style={styles.rankBadge}>
            <Text style={styles.rankNum}>#{globalRank.toLocaleString()}</Text>
          </View>
          <Text style={styles.rankCaption}>out of 50,000+ users this week</Text>
        </View>
      )}
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

  // Re-poll usage stats whenever the app returns to the foreground.
  // This covers the case where the user went to Android Settings to grant
  // Usage Access and comes back — the dashboard should reflect real data
  // immediately without a manual pull-to-refresh.
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

      <FocusModeToggle />

      <View style={styles.sectionSpacer}>
        <Text style={styles.sectionTitle}>Today's Impact</Text>
      </View>
      <ImpactCards />

      <View style={styles.sectionSpacer}>
        <Text style={styles.sectionTitle}>Wall of Shame</Text>
      </View>
      <WallOfShameSection />

      <WeeklySection />

      <BeforeAfterSection />

      <LeaderboardSection />

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
  focusModeCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 22,
  },
  focusModeCardActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  focusModeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  focusModeSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  togglePill: {
    marginLeft: 'auto',
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  togglePillActive: { backgroundColor: Colors.accentDark },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textSecondary,
  },
  toggleDotActive: {
    backgroundColor: Colors.background,
    alignSelf: 'flex-end',
  },
  impactRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 6,
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
  shameSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Colors.dangerMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.danger + '33',
    overflow: 'hidden',
  },
  shameCountCard: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shameCountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  shameIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.danger + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shameTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.danger,
  },
  shameDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.danger + 'AA',
    marginTop: 1,
  },
  shameRight: {
    alignItems: 'flex-end',
  },
  shameCount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 34,
    color: Colors.danger,
    lineHeight: 38,
  },
  shameTotalLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.danger + 'AA',
  },
  shameToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.danger + '22',
  },
  shameToggleText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.danger,
  },
  historyScroll: {
    maxHeight: 200,
  },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  historyEntryBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.danger + '18',
  },
  historyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  historyApp: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.danger,
    flex: 1,
  },
  historyTime: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.danger + 'AA',
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
  compareCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 16,
  },
  compareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compareToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  compareTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  compareTabActive: {
    backgroundColor: Colors.background,
  },
  compareTabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  compareTabTextActive: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
  },
  compareBody: {
    gap: 14,
  },
  compareItem: {
    gap: 6,
  },
  compareBarLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compareBarName: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  compareBarValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  compareTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  compareFill: {
    height: 8,
    borderRadius: 4,
  },
  reductionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  reductionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.accent,
  },
  leaderCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
  },
  leaderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.warningMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  leaderSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rankBadge: {
    backgroundColor: Colors.warningMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rankNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.warning,
  },
  rankCaption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
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
