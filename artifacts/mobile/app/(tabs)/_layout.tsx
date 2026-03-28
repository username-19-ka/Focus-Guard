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
      <NativeTabs.Trigger name="limits">
        <Icon sf={{ default: 'hourglass', selected: 'hourglass.tophalf.filled' }} />
        <Label>Limits</Label>
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
          tabBarIcon: ({ color }) => (
            <TabIcon sfName="slider.horizontal.3" featherName="sliders" color={color} />
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
        name="limits"
        options={{
          title: 'Limits',
          tabBarIcon: ({ color }) => (
            <TabIcon sfName="hourglass" featherName="activity" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// ─── Root export ───────────────────────────────────────────────────────────────

export default function TabLayout() {
  return (
    <PermissionGate>
      {IS_IOS && isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
    </PermissionGate>
  );
}
