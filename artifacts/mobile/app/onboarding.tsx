import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  checkOverlayPermission,
  checkUsagePermission,
  markOverlayGranted,
  markUsageGranted,
  openOverlaySettings,
  openUsageAccessSettings,
  subscribeToAppForeground,
} from '@/lib/PermissionService';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const UNLOCK_PARAGRAPH = `1HtRVjuIFexyllvdtriRCex197403367cfrCdeVTRjdeeojE4SIJdrrikEYOKNrseu4436_FDiufd543hgI8YRERIUGD5yioh_ç-(-'"hggfthGYS`;
const PAGE_COUNT = 3;

function DotIndicator({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
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
        FocusGuard puts you back in control of your digital life. Set limits,
        build schedules, and stay locked in — on your terms.
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
        When you hit a limit, there's no easy "just 5 more minutes." To unlock
        any blocked app, you must type this entire paragraph — perfectly.
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

interface PermissionRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  granted: boolean;
  pending: boolean;
  buttonLabel: string;
  onPress: () => void;
}

function PermissionRow({
  icon,
  title,
  description,
  granted,
  pending,
  buttonLabel,
  onPress,
}: PermissionRowProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSpring(0.95, { damping: 15 }, () => {
      scale.value = withSpring(1, { damping: 15 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionMeta}>
        <View
          style={[
            styles.permIconWrap,
            granted ? { backgroundColor: Colors.successMuted } : undefined,
          ]}
        >
          {granted
            ? <Feather name="check-circle" size={20} color={Colors.success} />
            : icon}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.permissionName}>{title}</Text>
          <Text style={styles.permissionDesc}>{description}</Text>
        </View>
      </View>

      <Animated.View style={animStyle}>
        <Pressable
          onPress={handlePress}
          disabled={granted}
          style={[
            styles.permButton,
            granted && styles.permButtonGranted,
            pending && !granted && styles.permButtonPending,
          ]}
        >
          {granted ? (
            <Text style={[styles.permButtonText, styles.permButtonTextGranted]}>
              Granted
            </Text>
          ) : (
            <>
              <Text style={styles.permButtonText}>{buttonLabel}</Text>
              <Feather name="external-link" size={13} color={Colors.accent} />
            </>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

interface PagePermissionsProps {
  onPermissionsChange: (usage: boolean, overlay: boolean) => void;
}

function PagePermissions({ onPermissionsChange }: PagePermissionsProps) {
  const [usageGranted, setUsageGranted] = useState(false);
  const [overlayGranted, setOverlayGranted] = useState(false);
  const [usagePending, setUsagePending] = useState(false);
  const [overlayPending, setOverlayPending] = useState(false);

  const isAndroid = Platform.OS === 'android';

  const recheck = useCallback(async () => {
    const [usage, overlay] = await Promise.all([
      checkUsagePermission(),
      checkOverlayPermission(),
    ]);

    if (usagePending && !usage) {
      await markUsageGranted();
      setUsageGranted(true);
      setUsagePending(false);
      onPermissionsChange(true, overlay || overlayGranted);
    } else if (usage) {
      setUsageGranted(true);
      setUsagePending(false);
    }

    if (overlayPending && !overlay) {
      await markOverlayGranted();
      setOverlayGranted(true);
      setOverlayPending(false);
      onPermissionsChange(usage || usageGranted, true);
    } else if (overlay) {
      setOverlayGranted(true);
      setOverlayPending(false);
    }
  }, [usagePending, overlayPending, usageGranted, overlayGranted, onPermissionsChange]);

  useEffect(() => {
    (async () => {
      const [usage, overlay] = await Promise.all([
        checkUsagePermission(),
        checkOverlayPermission(),
      ]);
      setUsageGranted(usage);
      setOverlayGranted(overlay);
      onPermissionsChange(usage, overlay);
    })();
  }, []);

  useEffect(() => {
    const unsub = subscribeToAppForeground(recheck);
    return unsub;
  }, [recheck]);

  const handleUsagePress = async () => {
    setUsagePending(true);
    await openUsageAccessSettings();
  };

  const handleOverlayPress = async () => {
    setOverlayPending(true);
    await openOverlaySettings();
  };

  return (
    <View style={styles.page}>
      <View style={[styles.iconCircle, { backgroundColor: Colors.blueMuted }]}>
        <Ionicons name="settings" size={52} color={Colors.blue} />
      </View>
      <Text style={styles.pageTitle}>Permissions{'\n'}Needed.</Text>
      <Text style={styles.pageSubtitle}>
        FocusGuard needs two Android system permissions to detect and block
        apps. Tap each button and grant access on the settings page that opens.
      </Text>

      {!isAndroid && (
        <View style={styles.webNotice}>
          <Feather name="info" size={14} color={Colors.blue} />
          <Text style={styles.webNoticeText}>
            Android permissions are not required on this platform.
          </Text>
        </View>
      )}

      <View style={styles.permissionsCard}>
        <PermissionRow
          icon={<Ionicons name="stats-chart" size={20} color={Colors.accent} />}
          title="Usage Stats Access"
          description="Detect which apps are running"
          granted={usageGranted}
          pending={usagePending}
          buttonLabel="Grant Usage Access"
          onPress={handleUsagePress}
        />

        <View style={styles.permissionDivider} />

        <PermissionRow
          icon={<Ionicons name="layers" size={20} color={Colors.blue} />}
          title="Display Over Apps"
          description="Show the blocker lock screen"
          granted={overlayGranted}
          pending={overlayPending}
          buttonLabel="Enable Overlay"
          onPress={handleOverlayPress}
        />
      </View>

      {(!usageGranted || !overlayGranted) && isAndroid && (
        <View style={styles.hintRow}>
          <Feather name="alert-circle" size={13} color={Colors.textTertiary} />
          <Text style={styles.hintText}>
            Grant both permissions to unlock the Finish button.
          </Text>
        </View>
      )}
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [usageGranted, setUsageGranted] = useState(Platform.OS !== 'android');
  const [overlayGranted, setOverlayGranted] = useState(Platform.OS !== 'android');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isLastPage = currentPage === PAGE_COUNT - 1;
  const bothGranted = usageGranted && overlayGranted;
  const finishDisabled = isLastPage && !bothGranted;

  const handlePermissionsChange = useCallback((usage: boolean, overlay: boolean) => {
    setUsageGranted(usage);
    setOverlayGranted(overlay);
  }, []);

  const handleNext = async () => {
    if (finishDisabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentPage < PAGE_COUNT - 1) {
      const next = currentPage + 1;
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      setCurrentPage(next);
    } else {
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      router.replace('/auth');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    router.replace('/auth');
  };

  const handleScroll = (e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  };

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
          <PagePermissions onPermissionsChange={handlePermissionsChange} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
        <DotIndicator count={PAGE_COUNT} activeIndex={currentPage} />

        <Pressable
          style={({ pressed }) => [
            styles.nextButton,
            finishDisabled && styles.nextButtonDisabled,
            !finishDisabled && pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          onPress={handleNext}
        >
          <Text style={[styles.nextButtonText, finishDisabled && styles.nextButtonTextDisabled]}>
            {isLastPage ? (bothGranted ? "Let's Go" : 'Grant Both Permissions') : 'Continue'}
          </Text>
          <Feather
            name={isLastPage ? (bothGranted ? 'check' : 'lock') : 'arrow-right'}
            size={18}
            color={finishDisabled ? Colors.textTertiary : Colors.background}
          />
        </Pressable>

        {!isLastPage && (
          <Pressable onPress={handleSkip}>
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
    marginBottom: 24,
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
  webNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.blueMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
  },
  webNoticeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.blue,
    flex: 1,
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
    padding: 16,
    gap: 12,
  },
  permissionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  permissionDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  permButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  permButtonGranted: {
    borderColor: Colors.success,
    backgroundColor: Colors.successMuted,
  },
  permButtonPending: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warningMuted,
  },
  permButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.accent,
  },
  permButtonTextGranted: {
    color: Colors.success,
  },
  permissionDivider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 16,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  hintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textTertiary,
    flex: 1,
    lineHeight: 20,
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
  nextButtonDisabled: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nextButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.background,
  },
  nextButtonTextDisabled: {
    color: Colors.textTertiary,
  },
  skipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textTertiary,
  },
});
