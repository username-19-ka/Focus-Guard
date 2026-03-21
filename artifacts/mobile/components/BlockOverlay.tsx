import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';

const UNLOCK_PARAGRAPH = `1HtRVjuIFexyllvdtriRCex197403367cfrCdeVTRjdeeojE4SIJdrrikEYOKNrseu4436_FDiufd543hgI8YRERIUGD5yioh_ç-(-'"hggfthGYS`;

const { width: W } = Dimensions.get('window');

type Props = {
  appName: string;
  onUnlocked: () => void;
  onClose: () => void;
};

export function BlockOverlay({ appName, onUnlocked, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState('');
  const [shakeAnim] = useState(new Animated.Value(0));
  const [progress, setProgress] = useState(0);
  const [flashRed, setFlashRed] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const shieldScale = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(shieldScale, { toValue: 1.08, duration: 300, useNativeDriver: true }),
      Animated.spring(shieldScale, { toValue: 1, useNativeDriver: true, damping: 12 }),
    ]).start();
  }, []);

  const shake = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setFlashRed(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start(() => setFlashRed(false));
  }, [shakeAnim]);

  const handleChange = (text: string) => {
    if (unlocking) return;

    const expected = UNLOCK_PARAGRAPH.substring(0, text.length);

    if (!UNLOCK_PARAGRAPH.startsWith(text)) {
      shake();
      setTyped('');
      setProgress(0);
      return;
    }

    setTyped(text);
    const pct = text.length / UNLOCK_PARAGRAPH.length;
    setProgress(pct);

    if (text.length === UNLOCK_PARAGRAPH.length) {
      handleUnlock();
    }
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const count = await AsyncStorage.getItem('wallOfShameCount');
    const current = count ? parseInt(count, 10) : 0;
    await AsyncStorage.setItem('wallOfShameCount', (current + 1).toString());

    Animated.sequence([
      Animated.timing(shieldScale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
      Animated.spring(shieldScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    setTimeout(() => onUnlocked(), 700);
  };

  const correctSoFar = typed.length;
  const upcoming = UNLOCK_PARAGRAPH.substring(correctSoFar, correctSoFar + 30);

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={[styles.container, { paddingTop: topPad + 8, paddingBottom: bottomPad + 8 }]}>
        <View style={styles.topSection}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Feather name="x" size={20} color={Colors.textTertiary} />
          </Pressable>

          <Animated.View style={[styles.shieldWrap, { transform: [{ scale: shieldScale }] }]}>
            <Ionicons name="shield" size={56} color={Colors.danger} />
            <Ionicons name="lock-closed" size={22} color={Colors.danger} style={styles.lockIcon} />
          </Animated.View>

          <Text style={styles.blockedTitle}>{appName} is Blocked</Text>
          <Text style={styles.blockedSubtitle}>
            You've hit your daily limit. To unlock, type the paragraph below — perfectly.
          </Text>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: unlocking ? Colors.success : flashRed ? Colors.danger : Colors.accent,
                },
              ]}
            />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
            <Text style={styles.progressCount}>{correctSoFar}/{UNLOCK_PARAGRAPH.length} chars</Text>
          </View>
        </View>

        <View style={[styles.paragraphBox, flashRed && styles.paragraphBoxError]}>
          <Text style={styles.paragraphLabel}>Unlock Code</Text>
          <Text style={styles.paragraphFull}>
            <Text style={styles.typedCorrect}>{UNLOCK_PARAGRAPH.substring(0, correctSoFar)}</Text>
            <Text style={styles.paragraphRemaining}>{UNLOCK_PARAGRAPH.substring(correctSoFar)}</Text>
          </Text>
        </View>

        <View style={styles.nextChars}>
          <Text style={styles.nextLabel}>Next characters:</Text>
          <Text style={styles.nextText}>{upcoming}</Text>
        </View>

        <Animated.View style={[styles.inputWrap, { transform: [{ translateX: shakeAnim }] }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, flashRed && { borderColor: Colors.danger }]}
            value={typed}
            onChangeText={handleChange}
            contextMenuHidden
            selectTextOnFocus={false}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="Start typing..."
            placeholderTextColor={Colors.textTertiary}
            editable={!unlocking}
          />
          {typed.length > 0 && (
            <Pressable
              style={styles.clearBtn}
              onPress={() => { setTyped(''); setProgress(0); }}
              hitSlop={8}
            >
              <Feather name="x-circle" size={18} color={Colors.textTertiary} />
            </Pressable>
          )}
        </Animated.View>

        <View style={styles.warningRow}>
          <Feather name="alert-triangle" size={13} color={Colors.textTertiary} />
          <Text style={styles.warningText}>Any typo resets your progress. No copy/paste allowed.</Text>
        </View>

        {unlocking && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.successText}>Unlocked! Wall of Shame +1</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    gap: 16,
  },
  topSection: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 6,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  shieldWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: Colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  lockIcon: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  blockedTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
  },
  blockedSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  progressSection: { gap: 6 },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.accent,
  },
  progressCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
  },
  paragraphBox: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  paragraphBoxError: {
    borderColor: Colors.danger + '88',
    backgroundColor: Colors.dangerMuted,
  },
  paragraphLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  paragraphFull: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  typedCorrect: {
    color: Colors.accent,
  },
  paragraphRemaining: {
    color: Colors.textSecondary,
  },
  nextChars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nextLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textTertiary,
  },
  nextText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.text,
    letterSpacing: 0.5,
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 14,
    letterSpacing: 0.3,
  },
  clearBtn: { paddingLeft: 8 },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  warningText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    backgroundColor: Colors.successMuted,
    borderRadius: 12,
    paddingVertical: 14,
  },
  successText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.success,
  },
});
