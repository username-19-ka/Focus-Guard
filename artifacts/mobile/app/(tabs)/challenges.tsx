import * as Haptics from 'expo-haptics';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Feather, Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import PoseTracker from '@/components/PoseTracker';
import { useDashboardStore } from '@/store/dashboardStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseType = 'pushup' | 'squat';
type ChallengeVariant = ExerciseType | 'custom';
type SessionPhase = 'select' | 'customSetup' | 'countdown' | 'session' | 'complete';

type ChallengeConfig = {
  variant: ChallengeVariant;
  exercise: ExerciseType;
  label: string;
  description: string;
  target: number;
  featherIcon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  difficulty: string;
  instruction: string;
};

// ─── Challenge definitions ────────────────────────────────────────────────────

const CHALLENGES: ChallengeConfig[] = [
  {
    variant: 'pushup',
    exercise: 'pushup',
    label: 'Push-up Challenge',
    description:
      'Complete 10 push-ups to unlock your apps. Lay your phone flat on the floor, front camera facing up.',
    target: 10,
    featherIcon: 'trending-up',
    color: Colors.accent,
    difficulty: 'Intermediate',
    instruction:
      'Place phone on the floor, camera facing up. Start in plank position above it. Get close on the DOWN phase.',
  },
  {
    variant: 'squat',
    exercise: 'squat',
    label: 'Squat Challenge',
    description:
      'Complete 15 squats to unlock your apps. Stand 1.5 m in front of your phone so your full body is visible.',
    target: 15,
    featherIcon: 'arrow-down',
    color: '#6C63FF',
    difficulty: 'Beginner',
    instruction:
      'Stand 1.5 m from phone, full body visible. Squat until hips reach knee level, then stand back up.',
  },
  {
    variant: 'custom',
    exercise: 'pushup',
    label: 'Custom Challenge',
    description:
      'Set your own exercise type and rep target. The tougher the challenge, the stronger the habit.',
    target: 0,
    featherIcon: 'settings',
    color: '#FF6B6B',
    difficulty: 'Your choice',
    instruction: 'Set your target and get to work.',
  },
];

const TARGET_STEPS = [5, 10, 15, 20, 25, 30];

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const [phase, setPhase] = useState<SessionPhase>('select');
  const [challenge, setChallenge] = useState<ChallengeConfig | null>(null);
  const [reps, setReps] = useState(0);
  const [phaseText, setPhaseText] = useState('');
  const [customExercise, setCustomExercise] = useState<ExerciseType>('pushup');
  const [customTarget, setCustomTarget] = useState(10);

  const handleSelect = (cfg: ChallengeConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (cfg.variant === 'custom') {
      setPhase('customSetup');
    } else {
      setChallenge(cfg);
      setReps(0);
      setPhaseText('');
      setPhase('countdown');
    }
  };

  const handleStartCustom = () => {
    const base = CHALLENGES.find(c => c.exercise === customExercise)!;
    setChallenge({
      ...base,
      variant: 'custom',
      target: customTarget,
      label: `Custom ${base.exercise === 'pushup' ? 'Push-up' : 'Squat'} Challenge`,
    });
    setReps(0);
    setPhaseText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('countdown');
  };

  const handleRep = useCallback(() => {
    setReps(prev => {
      const next = prev + 1;
      const target = challenge?.target ?? 10;
      if (next >= target) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setPhase('complete'), 400);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return next;
    });
  }, [challenge?.target]);

  const handleReset = () => {
    setPhase('select');
    setChallenge(null);
    setReps(0);
    setPhaseText('');
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {phase === 'select' && <SelectionView onSelect={handleSelect} />}

      {phase === 'customSetup' && (
        <CustomSetupView
          exercise={customExercise}
          target={customTarget}
          onExerciseChange={setCustomExercise}
          onTargetChange={setCustomTarget}
          onStart={handleStartCustom}
          onBack={() => setPhase('select')}
        />
      )}

      {phase === 'countdown' && challenge && (
        <CountdownView
          challenge={challenge}
          onComplete={() => setPhase('session')}
          onCancel={handleReset}
        />
      )}

      {phase === 'session' && challenge && (
        <SessionView
          challenge={challenge}
          reps={reps}
          phaseText={phaseText}
          onRep={handleRep}
          onPhaseChange={setPhaseText}
          onGiveUp={handleReset}
        />
      )}

      {phase === 'complete' && challenge && (
        <CompleteView
          challenge={challenge}
          reps={reps}
          onDone={handleReset}
        />
      )}
    </View>
  );
}

// ─── Selection view ───────────────────────────────────────────────────────────

function SelectionView({ onSelect }: { onSelect: (c: ChallengeConfig) => void }) {
  return (
    <ScrollView
      contentContainerStyle={styles.selectionScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Challenges</Text>
        <Text style={styles.pageDesc}>Earn app access by completing a physical challenge</Text>
      </View>

      <View style={styles.bannerCard}>
        <Feather name="zap" size={16} color={Colors.accent} />
        <Text style={styles.bannerText}>
          Complete a challenge to unlock blocked apps. The harder the challenge, the stronger the habit.
        </Text>
      </View>

      {CHALLENGES.map(c => (
        <Pressable
          key={c.variant}
          onPress={() => onSelect(c)}
          style={({ pressed }) => [styles.challengeCard, pressed && { opacity: 0.82 }]}
        >
          <View style={[styles.cardAccent, { backgroundColor: c.color }]} />
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <View style={[styles.cardIconWrap, { backgroundColor: c.color + '22' }]}>
                <Feather name={c.featherIcon} size={20} color={c.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{c.label}</Text>
                <View style={styles.cardMeta}>
                  <View style={[styles.diffBadge, { backgroundColor: c.color + '22' }]}>
                    <Text style={[styles.diffText, { color: c.color }]}>{c.difficulty}</Text>
                  </View>
                  {c.variant !== 'custom' && (
                    <Text style={styles.targetText}>{c.target} reps</Text>
                  )}
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.textTertiary} />
            </View>
            <Text style={styles.cardDesc}>{c.description}</Text>
          </View>
        </Pressable>
      ))}

      <View style={{ height: 110 }} />
    </ScrollView>
  );
}

// ─── Custom setup view ────────────────────────────────────────────────────────

function CustomSetupView({
  exercise,
  target,
  onExerciseChange,
  onTargetChange,
  onStart,
  onBack,
}: {
  exercise: ExerciseType;
  target: number;
  onExerciseChange: (e: ExerciseType) => void;
  onTargetChange: (n: number) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const targetIdx = TARGET_STEPS.indexOf(target);

  const adjustTarget = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(TARGET_STEPS.length - 1, targetIdx + dir));
    onTargetChange(TARGET_STEPS[next]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.setupContainer}>
      <View style={styles.setupHeader}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.setupTitle}>Custom Challenge</Text>
      </View>

      <Text style={styles.setupSectionLabel}>Exercise Type</Text>
      <View style={styles.exercisePicker}>
        {(['pushup', 'squat'] as ExerciseType[]).map(ex => (
          <Pressable
            key={ex}
            onPress={() => { onExerciseChange(ex); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.exerciseOption, exercise === ex && styles.exerciseOptionActive]}
          >
            <Feather
              name={ex === 'pushup' ? 'trending-up' : 'arrow-down'}
              size={18}
              color={exercise === ex ? Colors.accent : Colors.textTertiary}
            />
            <Text style={[styles.exerciseOptionText, exercise === ex && { color: Colors.accent }]}>
              {ex === 'pushup' ? 'Push-ups' : 'Squats'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.setupSectionLabel}>Target Reps</Text>
      <View style={styles.repPicker}>
        <Pressable
          onPress={() => adjustTarget(-1)}
          disabled={targetIdx <= 0}
          style={[styles.repAdjustBtn, targetIdx <= 0 && { opacity: 0.3 }]}
        >
          <Feather name="minus" size={18} color={Colors.text} />
        </Pressable>
        <View style={styles.repValueWrap}>
          <Text style={styles.repValue}>{target}</Text>
          <Text style={styles.repUnit}>reps</Text>
        </View>
        <Pressable
          onPress={() => adjustTarget(1)}
          disabled={targetIdx >= TARGET_STEPS.length - 1}
          style={[styles.repAdjustBtn, { backgroundColor: Colors.accentMuted }, targetIdx >= TARGET_STEPS.length - 1 && { opacity: 0.3 }]}
        >
          <Feather name="plus" size={18} color={Colors.accent} />
        </Pressable>
      </View>

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.85 }]}
      >
        <Feather name="zap" size={18} color={Colors.background} />
        <Text style={styles.startBtnText}>Start Challenge</Text>
      </Pressable>
    </View>
  );
}

// ─── Countdown view ───────────────────────────────────────────────────────────

function CountdownView({
  challenge,
  onComplete,
  onCancel,
}: {
  challenge: ChallengeConfig;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(3);
  const [showGo, setShowGo] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (n: number) => {
      setCount(n);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 200 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(scaleAnim, { toValue: 0.4, duration: 250, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
          ]).start(() => {
            if (n > 1) {
              pulse(n - 1);
            } else {
              setShowGo(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 6 }).start();
              Animated.timing(opacityAnim, { toValue: 1, duration: 80, useNativeDriver: true }).start();
              setTimeout(onComplete, 900);
            }
          });
        }, 700);
      });
    };
    pulse(3);
  }, []);

  return (
    <View style={styles.countdownContainer}>
      <Pressable onPress={onCancel} style={styles.countdownCancel} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textTertiary} />
      </Pressable>

      <Text style={[styles.countdownChallengeLabel, { color: challenge.color }]}>
        {challenge.label}
      </Text>

      <View style={[styles.instructionCard, { borderColor: challenge.color + '44' }]}>
        <Feather name="info" size={14} color={challenge.color} />
        <Text style={styles.instructionText}>{challenge.instruction}</Text>
      </View>

      <View style={styles.countdownCircleWrap}>
        <View style={[styles.countdownRing, { borderColor: challenge.color + '55' }]}>
          <Animated.Text
            style={[
              showGo ? styles.countdownGo : styles.countdownNumber,
              showGo && { color: challenge.color },
              { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
            ]}
          >
            {showGo ? 'GO!' : count}
          </Animated.Text>
        </View>
      </View>

      <Text style={styles.countdownHint}>
        {showGo ? 'Starting...' : 'Get into position!'}
      </Text>
    </View>
  );
}

// ─── Session view ─────────────────────────────────────────────────────────────

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function SessionView({
  challenge,
  reps,
  phaseText,
  onRep,
  onPhaseChange,
  onGiveUp,
}: {
  challenge: ChallengeConfig;
  reps: number;
  phaseText: string;
  onRep: () => void;
  onPhaseChange: (s: string) => void;
  onGiveUp: () => void;
}) {
  const progress = Math.min(reps / challenge.target, 1);
  const strokeOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.sessionContainer}>
      {/* Top bar */}
      <View style={styles.sessionTopBar}>
        <Pressable onPress={onGiveUp} hitSlop={8} style={styles.giveUpBtn}>
          <Feather name="x" size={16} color={Colors.textTertiary} />
          <Text style={styles.giveUpText}>Give Up</Text>
        </Pressable>
        <Text style={[styles.sessionChallengeName, { color: challenge.color }]}>
          {challenge.label}
        </Text>
      </View>

      {/* Rep counter with progress ring */}
      <View style={styles.repSection}>
        <Svg width={130} height={130} viewBox="0 0 130 130">
          <Circle
            cx={65} cy={65} r={RING_RADIUS}
            stroke={Colors.border}
            strokeWidth={8}
            fill="none"
          />
          <Circle
            cx={65} cy={65} r={RING_RADIUS}
            stroke={challenge.color}
            strokeWidth={8}
            fill="none"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            transform="rotate(-90, 65, 65)"
          />
        </Svg>
        <View style={styles.repOverlay}>
          <Text style={styles.repCount}>{reps}</Text>
          <Text style={styles.repTarget}>/ {challenge.target}</Text>
        </View>
      </View>

      {/* Phase text */}
      {phaseText ? (
        <View style={[styles.phaseChip, { backgroundColor: challenge.color + '22', borderColor: challenge.color + '44' }]}>
          <Text style={[styles.phaseText, { color: challenge.color }]}>{phaseText}</Text>
        </View>
      ) : (
        <View style={[styles.phaseChip, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <Text style={styles.phaseTextIdle}>Waiting for first rep...</Text>
        </View>
      )}

      {/* Camera / pose tracker */}
      <View style={styles.trackerWrap}>
        <PoseTracker
          exercise={challenge.exercise}
          active
          onRep={onRep}
          onPhaseChange={onPhaseChange}
        />
      </View>
    </View>
  );
}

// ─── Complete view ────────────────────────────────────────────────────────────

function CompleteView({
  challenge,
  reps,
  onDone,
}: {
  challenge: ChallengeConfig;
  reps: number;
  onDone: () => void;
}) {
  const unlockFocus = useDashboardStore(s => s.unlockFocus);
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Trigger the 10-minute unlock window
    unlockFocus();
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.completeContainer, { opacity: opacityAnim }]}>
      <Animated.View style={[styles.completeBadge, { transform: [{ scale: scaleAnim }], borderColor: challenge.color }]}>
        <Ionicons name="checkmark-circle" size={64} color={challenge.color} />
      </Animated.View>

      <Text style={styles.completeTitle}>Challenge Complete!</Text>
      <Text style={[styles.completeChallenge, { color: challenge.color }]}>{challenge.label}</Text>

      <View style={styles.completeStatsRow}>
        <View style={styles.completeStat}>
          <Text style={[styles.completeStatValue, { color: challenge.color }]}>{reps}</Text>
          <Text style={styles.completeStatLabel}>Reps Done</Text>
        </View>
        <View style={styles.completeStatDivider} />
        <View style={styles.completeStat}>
          <Text style={[styles.completeStatValue, { color: challenge.color }]}>{challenge.target}</Text>
          <Text style={styles.completeStatLabel}>Target</Text>
        </View>
        <View style={styles.completeStatDivider} />
        <View style={styles.completeStat}>
          <Text style={[styles.completeStatValue, { color: Colors.success }]}>100%</Text>
          <Text style={styles.completeStatLabel}>Complete</Text>
        </View>
      </View>

      <View style={styles.unlockBanner}>
        <Ionicons name="lock-open" size={20} color={Colors.success} />
        <Text style={styles.unlockText}>
          App access granted. Your blocked apps are now unlocked for this session.
        </Text>
      </View>

      <Pressable
        onPress={onDone}
        style={({ pressed }) => [styles.doneBtn, { backgroundColor: challenge.color }, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>

      <Pressable onPress={onDone} hitSlop={8} style={styles.anotherLink}>
        <Text style={styles.anotherLinkText}>Take another challenge</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Selection
  selectionScroll: { paddingHorizontal: 16, gap: 10 },
  pageHeader: { paddingBottom: 8 },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  pageDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.accentMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent + '33',
    padding: 12,
    marginBottom: 4,
  },
  bannerText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.accent, flex: 1, lineHeight: 20 },
  challengeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  diffBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  targetText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  cardDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Custom setup
  setupContainer: { flex: 1, paddingHorizontal: 20, gap: 16 },
  setupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 4 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  setupTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  setupSectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  exercisePicker: { flexDirection: 'row', gap: 10 },
  exerciseOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'center',
  },
  exerciseOptionActive: { borderColor: Colors.accent, backgroundColor: Colors.accentMuted },
  exerciseOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textTertiary },
  repPicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 12, justifyContent: 'space-between',
  },
  repAdjustBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  repValueWrap: { alignItems: 'center' },
  repValue: { fontFamily: 'Inter_700Bold', fontSize: 40, color: Colors.text },
  repUnit: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: Colors.accent,
    borderRadius: 16, paddingVertical: 18, marginTop: 8,
  },
  startBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: Colors.background },

  // Countdown
  countdownContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20,
  },
  countdownCancel: {
    position: 'absolute', top: 8, right: 4,
    padding: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  countdownChallengeLabel: {
    fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center',
  },
  instructionCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, padding: 14,
    width: '100%',
  },
  instructionText: {
    fontFamily: 'Inter_400Regular', fontSize: 13,
    color: Colors.textSecondary, flex: 1, lineHeight: 20,
  },
  countdownCircleWrap: { alignItems: 'center', justifyContent: 'center' },
  countdownRing: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  countdownNumber: {
    fontFamily: 'Inter_700Bold', fontSize: 80, color: Colors.text, textAlign: 'center',
  },
  countdownGo: {
    fontFamily: 'Inter_700Bold', fontSize: 52, textAlign: 'center',
  },
  countdownHint: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textTertiary,
  },

  // Session
  sessionContainer: { flex: 1, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  sessionTopBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 4,
  },
  giveUpBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  giveUpText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textTertiary },
  sessionChallengeName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  repSection: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  repOverlay: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
  },
  repCount: { fontFamily: 'Inter_700Bold', fontSize: 38, color: Colors.text },
  repTarget: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: -4 },
  phaseChip: {
    alignSelf: 'center', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  phaseText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  phaseTextIdle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textTertiary },
  trackerWrap: { flex: 1, borderRadius: 16, overflow: 'hidden' },

  // Complete
  completeContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, gap: 16,
  },
  completeBadge: {
    width: 120, height: 120, borderRadius: 32,
    backgroundColor: Colors.surface,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  completeTitle: {
    fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text,
  },
  completeChallenge: {
    fontFamily: 'Inter_600SemiBold', fontSize: 15,
    marginTop: -8,
  },
  completeStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', width: '100%',
  },
  completeStat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  completeStatValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  completeStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  completeStatDivider: { width: 1, height: '70%', backgroundColor: Colors.border },
  unlockBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.successMuted,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.success + '44',
    padding: 14, width: '100%',
  },
  unlockText: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.success, flex: 1, lineHeight: 20,
  },
  doneBtn: {
    width: '100%', borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
  },
  doneBtnText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: Colors.background },
  anotherLink: { marginTop: -4 },
  anotherLinkText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textTertiary },
});
