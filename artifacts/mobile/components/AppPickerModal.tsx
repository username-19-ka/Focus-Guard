/**
 * AppPickerModal
 *
 * Searchable modal for selecting apps to monitor. On Android (dev-client build)
 * it calls the native `getInstalledApps()` to show real device apps; on other
 * platforms it falls back to the curated app list so the UI always works.
 */
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { getAppInfo } from '@/lib/AppNameMapper';

export interface PickableApp {
  packageName: string;
  name: string;
  isSystemApp: boolean;
}

interface AppPickerModalProps {
  visible: boolean;
  excludePackages: string[];
  onAdd: (app: PickableApp) => void;
  onClose: () => void;
}

const FALLBACK_APPS: PickableApp[] = [
  { packageName: 'com.instagram.android',      name: 'Instagram',    isSystemApp: false },
  { packageName: 'com.zhiliaoapp.musically',   name: 'TikTok',       isSystemApp: false },
  { packageName: 'com.twitter.android',        name: 'X (Twitter)',   isSystemApp: false },
  { packageName: 'com.google.android.youtube', name: 'YouTube',      isSystemApp: false },
  { packageName: 'com.reddit.frontpage',       name: 'Reddit',       isSystemApp: false },
  { packageName: 'com.facebook.katana',        name: 'Facebook',     isSystemApp: false },
  { packageName: 'com.snapchat.android',       name: 'Snapchat',     isSystemApp: false },
  { packageName: 'com.pinterest',              name: 'Pinterest',    isSystemApp: false },
  { packageName: 'com.linkedin.android',       name: 'LinkedIn',     isSystemApp: false },
  { packageName: 'com.discord',                name: 'Discord',      isSystemApp: false },
  { packageName: 'com.twitch.android.app',     name: 'Twitch',       isSystemApp: false },
  { packageName: 'com.whatsapp',               name: 'WhatsApp',     isSystemApp: false },
  { packageName: 'com.netflix.mediaclient',    name: 'Netflix',      isSystemApp: false },
  { packageName: 'com.spotify.music',          name: 'Spotify',      isSystemApp: false },
  { packageName: 'org.telegram.messenger',     name: 'Telegram',     isSystemApp: false },
  { packageName: 'com.tinder',                 name: 'Tinder',       isSystemApp: false },
];

async function loadInstalledApps(): Promise<PickableApp[]> {
  if (Platform.OS !== 'android') return FALLBACK_APPS;
  try {
    const { getInstalledApps } = require('@focusguard/app-tracking');
    const apps = await getInstalledApps();
    if (Array.isArray(apps) && apps.length > 0) return apps as PickableApp[];
    return FALLBACK_APPS;
  } catch {
    return FALLBACK_APPS;
  }
}

function AppRow({
  app,
  onPress,
}: {
  app: PickableApp;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const info = getAppInfo(app.packageName);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 60, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={styles.appRow} onPress={handlePress}>
        <View style={[styles.appIconWrap, { backgroundColor: info.color + '22' }]}>
          <Ionicons name={info.icon as any} size={20} color={info.color} />
        </View>
        <View style={styles.appRowText}>
          <Text style={styles.appRowName} numberOfLines={1}>{app.name}</Text>
          {app.isSystemApp ? null : (
            <Text style={styles.appRowPkg} numberOfLines={1}>{app.packageName}</Text>
          )}
        </View>
        <View style={styles.addBtn}>
          <Feather name="plus" size={16} color={Colors.accent} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function AppPickerModal({
  visible,
  excludePackages,
  onAdd,
  onClose,
}: AppPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [allApps, setAllApps] = useState<PickableApp[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSearch('');
    loadInstalledApps().then((apps) => {
      setAllApps(apps);
      setLoading(false);
    });
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allApps.filter((app) => {
      if (excludePackages.includes(app.packageName)) return false;
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.packageName.toLowerCase().includes(q)
      );
    });
  }, [allApps, search, excludePackages]);

  const handleAdd = useCallback(
    (app: PickableApp) => {
      onAdd(app);
      onClose();
    },
    [onAdd, onClose]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Add App to Monitor</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search apps..."
            placeholderTextColor={Colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={styles.loadingText}>Loading installed apps...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>
              {search ? 'No results' : 'All apps added'}
            </Text>
            <Text style={styles.emptyDesc}>
              {search
                ? `No apps match "${search}"`
                : 'You are already monitoring all available apps.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.packageName}
            renderItem={({ item }) => (
              <AppRow app={item} onPress={() => handleAdd(item)} />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 0,
  },

  listContent: {
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
  },

  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  appIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appRowText: {
    flex: 1,
    gap: 2,
  },
  appRowName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  appRowPkg: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textTertiary,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
