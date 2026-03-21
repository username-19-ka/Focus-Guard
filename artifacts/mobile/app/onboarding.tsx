import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const UNLOCK_PARAGRAPH = `1HtRVjuIFexyllvdtriRCex197403367cfrCdeVTRjdeeojE4SIJdrrikEYOKNrseu4436_FDiufd543hgI8YRERIUGD5yioh_ç-(-'"hggfthGYS`;

const PAGES = [
  { id: 0 },
  { id: 1 },
  { id: 2 },
];

function DotIndicator({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === activeIndex && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

function PageIntro() {
  return (
    <View style={styles.page}>
      <View style={styles.iconCircle}>
        <Ionicons name="shield-checkmark" size={52} color={Colors.accent} />
      </View>
      <Text style={styles.pageTitle}>Take Back{'\n'}Your Time.</Text>
      <Text style={styles.pageSubtitle}>
        FocusGuard puts you back in control of your digital life. Set limits, build schedules, and stay locked in — on your terms.
      </Text>
      <View style={styles.featureList}>
        {[
          { icon: 'lock-closed', label: 'Hard-mode app blocking' },
          { icon: 'timer', label: 'Custom focus schedules' },
          { icon: 'bar-chart', label: 'Track your progress' },
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIconWrap}>
              <Ionicons name={f.icon as any} size={16} color={Colors.accent} />
            </View>
            <Text style={styles.featureLabel}>{f.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PageChallenge() {
  return (
    <View style={styles.page}>
      <View style={[styles.iconCircle, { backgroundColor: Colors.warningMuted }]}>
        <Ionicons name="keypad" size={52} color={Colors.warning} />
      </View>
      <Text style={styles.pageTitle}>The{'\n'}Challenge.</Text>
      <Text style={styles.pageSubtitle}>
        When you hit a limit, there's no easy "just 5 more minutes." To unlock any blocked app, you must type this entire paragraph — perfectly.
      </Text>
      <View style={styles.unlockPreview}>
        <Text style={styles.unlockLabel}>Your unlock code</Text>
        <View style={styles.unlockBox}>
          <Text style={styles.unlockText} numberOfLines={3}>
            {UNLOCK_PARAGRAPH}
          </Text>
        </View>
        <View style={styles.unlockBadge}>
          <Feather name="alert-triangle" size={12} color={Colors.warning} />
          <Text style={styles.unlockBadgeText}>Any typo resets your progress</Text>
        </View>
      </View>
    </View>
  );
}

function PagePermissions() {
  const [usageEnabled, setUsageEnabled] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);

  const usageScale = useSharedValue(1);
  const overlayScale = useSharedValue(1);

  const animateToggle = (sv: Animated.SharedValue<number>, toggle: () => void) => {
    sv.value = withSpring(0.95, { damping: 15 }, () => {
      sv.value = withSpring(1, { damping: 15 });
    });
    toggle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const usageStyle = useAnimatedStyle(() => ({ transform: [{ scale: usageScale.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ scale: overlayScale.value }] }));

  return (
    <View style={styles.page}>
      <View style={[styles.iconCircle, { backgroundColor: Colors.blueMuted }]}>
        <Ionicons name="settings" size={52} color={Colors.blue} />
      </View>
      <Text style={styles.pageTitle}>Permissions{'\n'}Needed.</Text>
      <Text style={styles.pageSubtitle}>
        FocusGuard needs two permissions to block apps and track your usage. Grant them on your device settings.
      </Text>
      <View style={styles.permissionsCard}>
        <Animated.View style={usageStyle}>
          <Pressable
            style={styles.permissionRow}
            onPress={() => animateToggle(usageScale, () => setUsageEnabled(v => !v))}
          >
            <View style={styles.permissionLeft}>
              <View style={[styles.permIconWrap, { backgroundColor: Colors.accentMuted }]}>
                <Ionicons name="stats-chart" size={20} color={Colors.accent} />
              </View>
              <View>
                <Text style={styles.permissionName}>Usage Stats</Text>
                <Text style={styles.permissionDesc}>See which apps you use most</Text>
              </View>
            </View>
            <View style={[styles.toggle, usageEnabled && styles.toggleActive]}>
              <View style={[styles.toggleThumb, usageEnabled && styles.toggleThumbActive]} />
            </View>
          </Pressable>
        </Animated.View>

        <View style={styles.permissionDivider} />

        <Animated.View style={overlayStyle}>
          <Pressable
            style={styles.permissionRow}
            onPress={() => animateToggle(overlayScale, () => setOverlayEnabled(v => !v))}
          >
            <View style={styles.permissionLeft}>
              <View style={[styles.permIconWrap, { backgroundColor: Colors.blueMuted }]}>
                <Ionicons name="layers" size={20} color={Colors.blue} />
              </View>
              <View>
                <Text style={styles.permissionName}>Overlay Permission</Text>
                <Text style={styles.permissionDesc}>Show blocker over other apps</Text>
              </View>
            </View>
            <View style={[styles.toggle, overlayEnabled && styles.toggleActive]}>
              <View style={[styles.toggleThumb, overlayEnabled && styles.toggleThumbActive]} />
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentPage < PAGES.length - 1) {
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({ x: nextPage * SCREEN_WIDTH, animated: true });
      setCurrentPage(nextPage);
    } else {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      router.replace('/auth');
    }
  };

  const handleScroll = (e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH }}>
          <PageIntro />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <PageChallenge />
        </View>
        <View style={{ width: SCREEN_WIDTH }}>
          <PagePermissions />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
        <DotIndicator count={PAGES.length} activeIndex={currentPage} />
        <Pressable
          style={({ pressed }) => [styles.nextButton, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {currentPage === PAGES.length - 1 ? "Let's Go" : 'Continue'}
          </Text>
          <Feather
            name={currentPage === PAGES.length - 1 ? 'check' : 'arrow-right'}
            size={18}
            color={Colors.background}
          />
        </Pressable>
        {currentPage < PAGES.length - 1 && (
          <Pressable onPress={async () => {
            await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
            router.replace('/auth');
          }}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  page: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  pageTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 42,
    color: Colors.text,
    lineHeight: 50,
    marginBottom: 16,
  },
  pageSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 26,
    marginBottom: 28,
  },
  featureList: {
    gap: 12,
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
  },
  unlockPreview: {
    width: '100%',
    gap: 10,
  },
  unlockLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  unlockBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  unlockText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  unlockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.warningMuted,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  unlockBadgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.warning,
  },
  permissionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: '100%',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  permissionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  permIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  permissionDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  permissionDivider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginLeft: 68,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.accent,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.textSecondary,
  },
  toggleThumbActive: {
    backgroundColor: Colors.background,
    alignSelf: 'flex-end',
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 16,
    gap: 16,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.accent,
  },
  nextButton: {
    width: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.background,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textTertiary,
  },
});
