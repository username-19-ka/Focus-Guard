/**
 * Tab layout — supports both the classic cross-platform Tabs navigator
 * and the iOS 26+ LiquidGlass native tabs.
 *
 * iOS-only modules (expo-symbols, expo-router/unstable-native-tabs,
 * expo-glass-effect) are loaded with conditional require() inside functions
 * so they are NEVER evaluated at bundle time on Android.
 */

import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PermissionGate } from '@/components/PermissionGate';
import { useActiveChallenge } from '@/store/activeChallengeStore';
import Colors from '@/constants/colors';

const IS_IOS = Platform.OS === 'ios';
const IS_WEB = Platform.OS === 'web';

// ─── iOS-only: check for LiquidGlass ──────────────────────────────────────────

function isLiquidGlassAvailable(): boolean {
  if (!IS_IOS) return false;
  try {
    const mod = require('expo-glass-effect');
    return typeof mod?.isLiquidGlassAvailable === 'function'
      ? mod.isLiquidGlassAvailable()
      : false;
  } catch {
    return false;
  }
}

// ─── iOS-only: LiquidGlass native tabs ────────────────────────────────────────
// NativeTabLayout is only ever called when IS_IOS && isLiquidGlassAvailable(),
// so the require()s inside are safe from Android evaluation.

function NativeTabLayout() {
  const { Icon, Label, NativeTabs } = require('expo-router/unstable-native-tabs');
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
        <Label>Dashboard</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'slider.horizontal.3', selected: 'slider.horizontal.3' }} />
        <Label>Apps</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="focus-zones">
        <Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <Label>Focus Zones</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="challenges">
        <Icon sf={{ default: 'bolt', selected: 'bolt.fill' }} />
        <Label>Challenges</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ─── Tab icon helper ───────────────────────────────────────────────────────────
// On iOS attempts expo-symbols, falls back to Feather.
// On Android always uses Feather — expo-symbols is never touched.

type FeatherName = React.ComponentProps<typeof Feather>['name'];

function TabIcon({
  sfName,
  featherName,
  color,
  size = 22,
}: {
  sfName: string;
  featherName: FeatherName;
  color: string;
  size?: number;
}) {
  if (IS_IOS) {
    try {
      const { SymbolView } = require('expo-symbols');
      return <SymbolView name={sfName} tintColor={color} size={size} />;
    } catch {
      // expo-symbols missing — fall through to Feather
    }
  }
  return <Feather name={featherName} size={size} color={color} />;
}

// ─── Classic cross-platform tabs ──────────────────────────────────────────────

function ClassicTabLayout() {
  const insets = useSafeAreaInsets();
  const isChallengeActive = useActiveChallenge(s => !!s.challenge);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: IS_IOS ? 'transparent' : Colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: Colors.tabBarBorder,
          elevation: 0,
          paddingBottom: IS_WEB ? 0 : insets.bottom,
          ...(IS_WEB ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          IS_IOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : IS_WEB ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.tabBar }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <TabIcon sfName="chart.bar.fill" featherName="bar-chart-2" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Apps',
          tabBarActiveTintColor: isChallengeActive ? Colors.textTertiary : Colors.accent,
          tabBarInactiveTintColor: isChallengeActive ? Colors.textTertiary + '55' : Colors.textTertiary,
          tabBarIcon: ({ color }) => (
            <View>
              <TabIcon
                sfName="slider.horizontal.3"
                featherName="sliders"
                color={isChallengeActive ? Colors.textTertiary + '55' : color}
              />
              {isChallengeActive && (
                <View style={styles.tabLockBadge}>
                  <Feather name="lock" size={7} color={Colors.textTertiary} />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="focus-zones"
        options={{
          title: 'Focus Zones',
          tabBarIcon: ({ color }) => (
            <TabIcon sfName="clock.fill" featherName="clock" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Challenges',
          tabBarIcon: ({ color }) => (
            <TabIcon sfName="bolt.fill" featherName="zap" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: Colors.tabBar,
    borderWidth: 1,
    borderColor: Colors.textTertiary + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Root export ───────────────────────────────────────────────────────────────

export default function TabLayout() {
  return (
    <PermissionGate>
      {IS_IOS && isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
    </PermissionGate>
  );
}
