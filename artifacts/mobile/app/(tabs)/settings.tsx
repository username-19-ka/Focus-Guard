import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useActiveChallenge } from '@/store/activeChallengeStore';
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
  { id: 'tiktok', name: 'TikTok', icon: 'play-circle', color: '#69C9D0', enabled: true, expanded: false, lockDuration: 15, unlockGoals: 2, unlockTimeLimit: 30 },
  { id: 'twitter', name: 'Twitter', icon: 'logo-twitter', color: '#1DA1F2', enabled: false, expanded: false, lockDuration: 30, unlockGoals: 3, unlockTimeLimit: 45 },
  { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', color: '#FF0000', enabled: true, expanded: false, lockDuration: 60, unlockGoals: 5, unlockTimeLimit: 90 },
  { id: 'reddit', name: 'Reddit', icon: 'logo-reddit', color: '#FF4500', enabled: false, expanded: false, lockDuration: 30, unlockGoals: 2, unlockTimeLimit: 60 },
  { id: 'facebook', name: 'Facebook', icon: 'logo-facebook', color: '#1877F2', enabled: false, expanded: false, lockDuration: 30, unlockGoals: 3, unlockTimeLimit: 60 },
];

const ALL_POSSIBLE_APPS: Omit<AppConfig, 'enabled' | 'expanded' | 'lockDuration' | 'unlockGoals' | 'unlockTimeLimit'>[] = [
  { id: 'instagram', name: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { id: 'tiktok', name: 'TikTok', icon: 'play-circle', color: '#69C9D0' },
  { id: 'twitter', name: 'Twitter', icon: 'logo-twitter', color: '#1DA1F2' },
  { id: 'youtube', name: 'YouTube', icon: 'logo-youtube', color: '#FF0000' },
  { id: 'reddit', name: 'Reddit', icon: 'logo-reddit', color: '#FF4500' },
  { id: 'facebook', name: 'Facebook', icon: 'logo-facebook', color: '#1877F2' },
  { id: 'snapchat', name: 'Snapchat', icon: 'camera', color: '#FFCD00' },
  { id: 'pinterest', name: 'Pinterest', icon: 'bookmark', color: '#E60023' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'briefcase', color: '#0077B5' },
  { id: 'discord', name: 'Discord', icon: 'chatbubbles', color: '#5865F2' },
  { id: 'twitch', name: 'Twitch', icon: 'tv', color: '#9146FF' },
  { id: 'whatsapp', name: 'WhatsApp', icon: 'chatbubble-ellipses', color: '#25D366' },
  { id: 'netflix', name: 'Netflix', icon: 'film', color: '#E50914' },
  { id: 'spotify', name: 'Spotify', icon: 'musical-notes', color: '#1DB954' },
  { id: 'telegram', name: 'Telegram', icon: 'paper-plane', color: '#2CA5E0' },
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

function AppCard({ app, onToggle, onExpand, onUpdate, onDelete }: {
  app: AppConfig;
  onToggle: () => void;
  onExpand: () => void;
  onUpdate: (field: keyof AppConfig, val: any) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chevronRotation = useRef(new Animated.Value(app.expanded ? 180 : 0)).current;

  useEffect(() => {
    Animated.spring(chevronRotation, {
      toValue: app.expanded ? 180 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
    }).start();
  }, [app.expanded]);

  const chevronStyle = {
    transform: [{ rotate: chevronRotation.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] }) }],
  };

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

        {confirmDelete ? (
          <View style={styles.deleteConfirmRow}>
            <Pressable
              onPress={() => setConfirmDelete(false)}
              style={styles.cancelDeleteBtn}
              hitSlop={4}
            >
              <Text style={styles.cancelDeleteText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onDelete(); }}
              style={styles.confirmDeleteBtn}
              hitSlop={4}
            >
              <Feather name="trash-2" size={14} color={Colors.danger} />
              <Text style={styles.confirmDeleteText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cardRightActions}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setConfirmDelete(true); }}
              hitSlop={8}
              style={styles.trashBtn}
            >
              <Feather name="trash-2" size={16} color={Colors.textTertiary} />
            </Pressable>
            <Animated.View style={chevronStyle}>
              <Feather name="chevron-down" size={18} color={Colors.textTertiary} />
            </Animated.View>
          </View>
        )}
      </Pressable>

      {app.expanded && !confirmDelete && (
        <View style={styles.expansionPanel}>
          <View style={styles.expansionDivider} />
          <PickerRow label="Lock Duration" value={app.lockDuration} options={DURATION_OPTIONS} onChange={v => onUpdate('lockDuration', v)} />
          <View style={styles.internalDivider} />
          <PickerRow label="Unlock Goals" value={app.unlockGoals} options={GOAL_OPTIONS} onChange={v => onUpdate('unlockGoals', v)} />
          <View style={styles.internalDivider} />
          <PickerRow label="Unlock Time Limit" value={app.unlockTimeLimit} options={TIME_LIMIT_OPTIONS} onChange={v => onUpdate('unlockTimeLimit', v)} />
        </View>
      )}
    </View>
  );
}

function AddAppModal({ visible, existingIds, onAdd, onClose }: {
  visible: boolean;
  existingIds: string[];
  onAdd: (app: Omit<AppConfig, 'enabled' | 'expanded' | 'lockDuration' | 'unlockGoals' | 'unlockTimeLimit'>) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const available = ALL_POSSIBLE_APPS.filter(a => !existingIds.includes(a.id));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add an App</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn} hitSlop={8}>
            <Feather name="x" size={20} color={Colors.text} />
          </Pressable>
        </View>
        <Text style={styles.modalSubtitle}>Select an app to start tracking and blocking it</Text>

        {available.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={40} color={Colors.accent} />
            <Text style={styles.emptyTitle}>All apps added</Text>
            <Text style={styles.emptyDesc}>You are already tracking all available apps.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingTop: 16 }}>
            {available.map(app => (
              <Pressable
                key={app.id}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAdd(app); onClose(); }}
                style={({ pressed }) => [styles.availableAppRow, pressed && { opacity: 0.75 }]}
              >
                <View style={[styles.appCardIcon, { backgroundColor: app.color + '22' }]}>
                  <Ionicons name={app.icon as any} size={22} color={app.color} />
                </View>
                <Text style={styles.appCardName}>{app.name}</Text>
                <View style={styles.addIconWrap}>
                  <Feather name="plus" size={18} color={Colors.accent} />
                </View>
              </Pressable>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppConfig[]>(DEFAULT_APPS);
  const [showAddModal, setShowAddModal] = useState(false);
  const activeChallenge = useActiveChallenge(s => s.challenge);
  const isChallengeActive = !!activeChallenge;
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

  const deleteApp = (id: string) => {
    save(apps.filter(a => a.id !== id));
  };

  const addApp = (base: Omit<AppConfig, 'enabled' | 'expanded' | 'lockDuration' | 'unlockGoals' | 'unlockTimeLimit'>) => {
    const newApp: AppConfig = { ...base, enabled: true, expanded: false, lockDuration: 30, unlockGoals: 3, unlockTimeLimit: 60 };
    save([...apps, newApp]);
  };

  const enabledCount = apps.filter(a => a.enabled).length;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: topPad + 8, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Managed Apps</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{enabledCount} active</Text>
          </View>
        </View>

        <Text style={styles.pageDesc}>
          Toggle apps to block them when limits are hit. Expand to configure lock duration, unlock goals, and time limits.
        </Text>

        <View style={styles.appList}>
          {apps.map(app => (
            <AppCard
              key={app.id}
              app={app}
              onToggle={() => toggle(app.id)}
              onExpand={() => expand(app.id)}
              onUpdate={(field, val) => update(app.id, field, val)}
              onDelete={() => deleteApp(app.id)}
            />
          ))}
        </View>

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAddModal(true); }}
          style={({ pressed }) => [styles.addAppBtn, pressed && { opacity: 0.8 }]}
        >
          <Feather name="plus-circle" size={20} color={Colors.accent} />
          <Text style={styles.addAppBtnText}>Add an App</Text>
        </Pressable>
      </ScrollView>

      <AddAppModal
        visible={showAddModal}
        existingIds={apps.map(a => a.id)}
        onAdd={addApp}
        onClose={() => setShowAddModal(false)}
      />

      {isChallengeActive && (
        <View style={[styles.challengeOverlay, { paddingTop: topPad }]}>
          <View style={styles.challengeOverlayCard}>
            <View style={styles.challengeOverlayIcon}>
              <Feather name="lock" size={28} color={Colors.accent} />
            </View>
            <Text style={styles.challengeOverlayTitle}>Challenge Mode Active</Text>
            <Text style={styles.challengeOverlayDesc}>
              App limits are managed automatically by your active challenge.{'\n'}
              Complete your challenge or end it to edit app settings.
            </Text>
            {activeChallenge && (
              <View style={styles.challengeOverlayBadge}>
                <Feather name="zap" size={13} color={Colors.accent} />
                <Text style={styles.challengeOverlayBadgeText}>{activeChallenge.challengeLabel}</Text>
              </View>
            )}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(tabs)/challenges'); }}
              style={styles.challengeOverlayBtn}
            >
              <Text style={styles.challengeOverlayBtnText}>Go to Challenges</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
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
  toggleWrap: { marginRight: 4 },
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
  cardRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trashBtn: {
    padding: 2,
  },
  deleteConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelDeleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
  },
  cancelDeleteText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  confirmDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.dangerMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
  },
  confirmDeleteText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.danger,
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
  addAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    backgroundColor: Colors.accentMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accent + '44',
    borderStyle: 'dashed',
  },
  addAppBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.accent,
  },

  // Add App Modal
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  availableAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  addIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  challengeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background + 'F2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  challengeOverlayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.accent + '44',
    padding: 28,
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  challengeOverlayIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  challengeOverlayTitle: {
    fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, textAlign: 'center',
  },
  challengeOverlayDesc: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  challengeOverlayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accentMuted, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  challengeOverlayBadgeText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.accent,
  },
  challengeOverlayBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 32, marginTop: 4,
  },
  challengeOverlayBtnText: {
    fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.background,
  },
});
