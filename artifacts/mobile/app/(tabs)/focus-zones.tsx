import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const COLORS = [Colors.accent, Colors.blue, Colors.warning, Colors.danger, '#A78BFA', '#FB923C', '#34D399'];

const MOCK_BLOCKABLE_APPS = [
  { packageName: 'com.instagram.android',      name: 'Instagram',  icon: 'logo-instagram' as const, color: '#E1306C' },
  { packageName: 'com.zhiliaoapp.musically',   name: 'TikTok',     icon: 'play-circle'    as const, color: '#69C9D0' },
  { packageName: 'com.twitter.android',        name: 'X',          icon: 'logo-twitter'   as const, color: '#1DA1F2' },
  { packageName: 'com.google.android.youtube', name: 'YouTube',    icon: 'logo-youtube'   as const, color: '#FF0000' },
  { packageName: 'com.reddit.frontpage',       name: 'Reddit',     icon: 'logo-reddit'    as const, color: '#FF4500' },
  { packageName: 'com.facebook.katana',        name: 'Facebook',   icon: 'logo-facebook'  as const, color: '#1877F2' },
  { packageName: 'com.snapchat.android',       name: 'Snapchat',   icon: 'camera'         as const, color: '#FFFC00' },
  { packageName: 'com.linkedin.android',       name: 'LinkedIn',   icon: 'logo-linkedin'  as const, color: '#0A66C2' },
];

type FocusZone = {
  id: string;
  name: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  days: number[];
  color: string;
  enabled: boolean;
  blockedApps: string[];
};

const DEFAULT_ZONES: FocusZone[] = [
  { id: '1', name: 'Work Hours',  startHour: 9,  startMin: 0, endHour: 17, endMin: 0,  days: [0, 1, 2, 3, 4],          color: Colors.accent,  enabled: true,  blockedApps: [] },
  { id: '2', name: 'Study Time',  startHour: 19, startMin: 0, endHour: 21, endMin: 0,  days: [0, 1, 2, 3, 4],          color: Colors.blue,    enabled: false, blockedApps: [] },
  { id: '3', name: 'No Screens',  startHour: 22, startMin: 0, endHour: 23, endMin: 59, days: [0, 1, 2, 3, 4, 5, 6],   color: Colors.danger,  enabled: true,  blockedApps: [] },
];

function formatTime(h: number, m: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  const min = m.toString().padStart(2, '0');
  return `${hour}:${min} ${ampm}`;
}

function TimeWheel({ label, hour, min, onHourChange, onMinChange }: {
  label: string;
  hour: number;
  min: number;
  onHourChange: (h: number) => void;
  onMinChange: (m: number) => void;
}) {
  return (
    <View style={styles.timeWheel}>
      <Text style={styles.timeWheelLabel}>{label}</Text>
      <View style={styles.timeWheelControls}>
        <View style={styles.timeUnit}>
          <Pressable onPress={() => onHourChange((hour + 1) % 24)} hitSlop={8}>
            <Feather name="chevron-up" size={20} color={Colors.accent} />
          </Pressable>
          <Text style={styles.timeValue}>{hour.toString().padStart(2, '0')}</Text>
          <Pressable onPress={() => onHourChange((hour - 1 + 24) % 24)} hitSlop={8}>
            <Feather name="chevron-down" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
        <Text style={styles.timeColon}>:</Text>
        <View style={styles.timeUnit}>
          <Pressable onPress={() => onMinChange((min + 15) % 60)} hitSlop={8}>
            <Feather name="chevron-up" size={20} color={Colors.accent} />
          </Pressable>
          <Text style={styles.timeValue}>{min.toString().padStart(2, '0')}</Text>
          <Pressable onPress={() => onMinChange((min - 15 + 60) % 60)} hitSlop={8}>
            <Feather name="chevron-down" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function AppBlockSelector({ selected, onToggle }: {
  selected: string[];
  onToggle: (pkg: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.appSelectorList}
    >
      {MOCK_BLOCKABLE_APPS.map(item => {
        const isSelected = selected.includes(item.packageName);
        return (
          <Pressable
            key={item.packageName}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggle(item.packageName);
            }}
            style={[
              styles.appChip,
              isSelected && { borderColor: item.color, borderWidth: 2, backgroundColor: item.color + '18' },
            ]}
          >
            <View style={[styles.appChipIcon, { backgroundColor: item.color + '22' }]}>
              <Ionicons name={item.icon} size={18} color={item.color} />
            </View>
            <Text style={[styles.appChipName, isSelected && { color: Colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {isSelected && (
              <View style={[styles.appChipCheck, { backgroundColor: item.color }]}>
                <Feather name="check" size={9} color={Colors.background} />
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ZoneCard({ zone, onToggle, onEdit, onDelete }: {
  zone: FocusZone;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const activeDays = zone.days.map(d => DAYS[d]).join('  ');

  if (confirming) {
    return (
      <View style={[styles.zoneCard, styles.zoneCardConfirm]}>
        <View style={[styles.zoneStripe, { backgroundColor: Colors.danger }]} />
        <View style={[styles.zoneBody, { justifyContent: 'center', gap: 12 }]}>
          <Text style={styles.confirmTitle}>Delete "{zone.name}"?</Text>
          <Text style={styles.confirmSub}>This schedule will be permanently removed.</Text>
          <View style={styles.confirmRow}>
            <Pressable
              onPress={() => setConfirming(false)}
              style={styles.confirmCancelBtn}
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onDelete();
              }}
              style={styles.confirmDeleteBtn}
            >
              <Feather name="trash-2" size={13} color={Colors.danger} />
              <Text style={styles.confirmDeleteText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.zoneCard}>
      <View style={[styles.zoneStripe, { backgroundColor: zone.color }]} />
      <View style={styles.zoneBody}>
        <View style={styles.zoneTop}>
          <Text style={styles.zoneName}>{zone.name}</Text>
          <View style={styles.zoneActions}>
            <Pressable onPress={onEdit} hitSlop={8} style={styles.zoneActionBtn}>
              <Feather name="edit-2" size={15} color={Colors.textTertiary} />
            </Pressable>
            <Pressable onPress={() => setConfirming(true)} hitSlop={12} style={styles.zoneActionBtn}>
              <Feather name="trash-2" size={15} color={Colors.danger} />
            </Pressable>
            <Pressable onPress={onToggle} hitSlop={6}>
              <View style={[styles.toggle, zone.enabled && { backgroundColor: zone.color }]}>
                <View style={[styles.toggleThumb, zone.enabled && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>
        </View>
        <Text style={styles.zoneTime}>
          {formatTime(zone.startHour, zone.startMin)} – {formatTime(zone.endHour, zone.endMin)}
        </Text>
        <Text style={styles.zoneDays}>{activeDays}</Text>
        {(zone.blockedApps?.length ?? 0) > 0 && (
          <Text style={styles.zoneBlocked}>
            {zone.blockedApps.length} app{zone.blockedApps.length !== 1 ? 's' : ''} blocked
          </Text>
        )}
      </View>
    </View>
  );
}

function AnimatedZoneCard({ zone, onToggle, onEdit, onDelete, isExiting, onExited }: {
  zone: FocusZone;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isExiting: boolean;
  onExited: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const maxHeight = useRef(new Animated.Value(120)).current;

  useEffect(() => {
    if (isExiting) {
      Animated.parallel([
        Animated.timing(opacity,     { toValue: 0,   duration: 240, useNativeDriver: false }),
        Animated.timing(translateX,  { toValue: 40,  duration: 240, useNativeDriver: false }),
        Animated.timing(maxHeight,   { toValue: 0,   duration: 280, useNativeDriver: false }),
      ]).start(() => onExited());
    }
  }, [isExiting]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }], maxHeight, overflow: 'hidden' }}>
      <ZoneCard
        zone={zone}
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </Animated.View>
  );
}

function ZoneModal({ visible, zone, onSave, onClose }: {
  visible: boolean;
  zone: Partial<FocusZone> | null;
  onSave: (z: FocusZone) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(zone?.name ?? '');
  const [startH, setStartH] = useState(zone?.startHour ?? 9);
  const [startM, setStartM] = useState(zone?.startMin ?? 0);
  const [endH, setEndH] = useState(zone?.endHour ?? 17);
  const [endM, setEndM] = useState(zone?.endMin ?? 0);
  const [days, setDays] = useState<number[]>(zone?.days ?? [0, 1, 2, 3, 4]);
  const [color, setColor] = useState(zone?.color ?? Colors.accent);
  const [blockedApps, setBlockedApps] = useState<string[]>(zone?.blockedApps ?? []);

  useEffect(() => {
    if (visible && zone) {
      setName(zone.name ?? '');
      setStartH(zone.startHour ?? 9);
      setStartM(zone.startMin ?? 0);
      setEndH(zone.endHour ?? 17);
      setEndM(zone.endMin ?? 0);
      setDays(zone.days ?? [0, 1, 2, 3, 4]);
      setColor(zone.color ?? Colors.accent);
      setBlockedApps(zone.blockedApps ?? []);
    } else if (visible && !zone) {
      setName('');
      setStartH(9);
      setStartM(0);
      setEndH(17);
      setEndM(0);
      setDays([0, 1, 2, 3, 4]);
      setColor(Colors.accent);
      setBlockedApps([]);
    }
  }, [visible, zone]);

  const toggleDay = (d: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const toggleApp = (pkg: string) => {
    setBlockedApps(prev => prev.includes(pkg) ? prev.filter(x => x !== pkg) : [...prev, pkg]);
  };

  const save = () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    onSave({
      id: zone?.id ?? Date.now().toString(),
      name: name.trim(),
      startHour: startH, startMin: startM,
      endHour: endH, endMin: endM,
      days, color,
      enabled: zone?.enabled ?? true,
      blockedApps,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{zone?.id ? 'Edit' : 'New'} Focus Zone</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Zone Name</Text>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Work Hours"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Time Range</Text>
              <View style={styles.timeRow}>
                <TimeWheel label="Start" hour={startH} min={startM} onHourChange={setStartH} onMinChange={setStartM} />
                <Feather name="arrow-right" size={18} color={Colors.textTertiary} />
                <TimeWheel label="End" hour={endH} min={endM} onHourChange={setEndH} onMinChange={setEndM} />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Days</Text>
              <View style={styles.daysRow}>
                {DAYS.map((d, i) => (
                  <Pressable
                    key={d}
                    onPress={() => toggleDay(i)}
                    style={[styles.dayChip, days.includes(i) && { backgroundColor: color }]}
                  >
                    <Text style={[styles.dayChipText, days.includes(i) && { color: Colors.background }]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Apps to Block</Text>
              <Text style={styles.fieldSub}>
                {blockedApps.length === 0
                  ? 'Select apps to restrict during this zone'
                  : `${blockedApps.length} app${blockedApps.length !== 1 ? 's' : ''} selected`}
              </Text>
              <AppBlockSelector selected={blockedApps} onToggle={toggleApp} />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorRow}>
                {COLORS.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={[styles.colorChip, { backgroundColor: c }, color === c && styles.colorChipSelected]}
                  />
                ))}
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
              onPress={save}
            >
              <Text style={styles.saveBtnText}>Save Zone</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function FocusZonesScreen() {
  const insets = useSafeAreaInsets();
  const [zones, setZones] = useState<FocusZone[]>(DEFAULT_ZONES);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingZone, setEditingZone] = useState<FocusZone | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    AsyncStorage.getItem('focusZones').then(v => {
      if (v) {
        try {
          const parsed: FocusZone[] = JSON.parse(v);
          setZones(parsed.map(z => ({ ...z, blockedApps: z.blockedApps ?? [] })));
        } catch {}
      }
    });
  }, []);

  const persist = (updated: FocusZone[]) => {
    setZones(updated);
    AsyncStorage.setItem('focusZones', JSON.stringify(updated));
  };

  const handleSave = (z: FocusZone) => {
    const exists = zones.find(x => x.id === z.id);
    const updated = exists ? zones.map(x => x.id === z.id ? z : x) : [...zones, z];
    persist(updated);
    setModalVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
  };

  const handleExited = (id: string) => {
    persist(zones.filter(z => z.id !== id));
    setDeletingId(null);
  };

  const handleToggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(zones.map(z => z.id === id ? { ...z, enabled: !z.enabled } : z));
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Focus Zones</Text>
          <Text style={styles.pageDesc}>{zones.filter(z => z.enabled).length} active schedules</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
          onPress={() => { setEditingZone(null); setModalVisible(true); }}
        >
          <Feather name="plus" size={20} color={Colors.background} />
        </Pressable>
      </View>

      {zones.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Focus Zones</Text>
          <Text style={styles.emptyDesc}>Create a schedule to automatically block distractions during key times.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {zones.map(z => (
            <AnimatedZoneCard
              key={z.id}
              zone={z}
              onToggle={() => handleToggle(z.id)}
              onEdit={() => { setEditingZone(z); setModalVisible(true); }}
              onDelete={() => handleDelete(z.id)}
              isExiting={deletingId === z.id}
              onExited={() => handleExited(z.id)}
            />
          ))}
        </ScrollView>
      )}

      <ZoneModal
        visible={modalVisible}
        zone={editingZone}
        onSave={handleSave}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  pageDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text },
  emptyDesc: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  zoneCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  zoneStripe: { width: 4 },
  zoneBody: { flex: 1, padding: 14, gap: 4 },
  zoneTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoneName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text, flex: 1 },
  zoneActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneActionBtn: { padding: 4 },
  zoneTime: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary },
  zoneDays: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textTertiary, letterSpacing: 0.5 },
  zoneBlocked: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.accent,
    marginTop: 2,
  },
  zoneCardConfirm: {
    borderColor: Colors.danger + '55',
  },
  confirmTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  confirmSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: -6,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.dangerMuted,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  confirmDeleteText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.danger,
  },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: Colors.border, padding: 3, justifyContent: 'center',
  },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.textSecondary },
  toggleThumbOn: { backgroundColor: Colors.background, alignSelf: 'flex-end' },
  modalOverlay: { flex: 1, backgroundColor: Colors.scrim, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text },
  fieldWrap: { marginBottom: 20 },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  nameInput: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.text,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  timeWheel: { alignItems: 'center', gap: 8 },
  timeWheelLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textTertiary },
  timeWheelControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeUnit: { alignItems: 'center', gap: 4 },
  timeValue: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text, minWidth: 48, textAlign: 'center' },
  timeColon: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.textSecondary },
  daysRow: { flexDirection: 'row', gap: 8 },
  dayChip: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  dayChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textSecondary },
  appSelectorList: {
    gap: 10,
    paddingVertical: 4,
  },
  appChip: {
    alignItems: 'center',
    width: 70,
    gap: 6,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 10,
    paddingHorizontal: 6,
    position: 'relative',
  },
  appChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appChipName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  appChipCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorChip: { width: 32, height: 32, borderRadius: 16 },
  colorChipSelected: { borderWidth: 3, borderColor: Colors.text },
  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 8,
  },
  saveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.background },
});
