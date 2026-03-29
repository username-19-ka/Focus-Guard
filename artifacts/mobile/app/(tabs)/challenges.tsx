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
import { useBankedMinutes } from '@/store/bankedMinutesStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseType = 'pushup' | 'squat';
type DifficultyPreset = 'easy' | 'medium' | 'hard' | 'athlete' | 'custom';
type Phase =
  | 'select'
  | 'buildYourOwn'
  | 'difficulty'
  | 'customRatio'
  | 'duration'
  | 'guideWelcome'
  | 'guidePosition'
  | 'countdown'
  | 'session'
  | 'complete';

const DIFFICULTY_CONFIG: Record<Exclude<DifficultyPreset, 'custom'>, { repsPerUnit: number; minutesPerUnit: number; color: string; label: string; tagline: string }> = {
  easy:    { repsPerUnit: 1,  minutesPerUnit: 3, color: Colors.success,  label: 'Easy',    tagline: '1 rep = 3 min' },
  medium:  { repsPerUnit: 1,  minutesPerUnit: 1, color: Colors.blue,     label: 'Medium',  tagline: '1 rep = 1 min' },
  hard:    { repsPerUnit: 3,  minutesPerUnit: 1, color: Colors.warning,  label: 'Hard',    tagline: '3 reps = 1 min' },
  athlete: { repsPerUnit: 10, minutesPerUnit: 1, color: '#FF4458',       label: 'Athlete', tagline: '10 reps = 1 min' },
};

const DURATION_OPTIONS = [
  { label: '1 Day',    value: 1 },
  { label: '3 Days',   value: 3 },
  { label: '1 Week',   value: 7 },
  { label: '2 Weeks',  value: 14 },
  { label: '1 Month',  value: 30 },
];

function exerciseTarget(ex: ExerciseType): number {
  return ex === 'pushup' ? 10 : 15;
}

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const addMinutes = useBankedMinutes(s => s.addMinutes);

  const [phase, setPhase] = useState<Phase>('select');
  const [entryType, setEntryType] = useState<'pushup' | 'squat' | 'buildOwn'>('pushup');
  const [activeExercises, setActiveExercises] = useState<ExerciseType[]>(['pushup']);
  const [difficulty, setDifficulty] = useState<DifficultyPreset>('medium');
  const [repsPerUnit, setRepsPerUnit] = useState(1);
  const [minutesPerUnit, setMinutesPerUnit] = useState(1);
  const [durationDays, setDurationDays] = useState(7);

  const [totalReps, setTotalReps] = useState(0);
  const [circuitIdx, setCircuitIdx] = useState(0);
  const [repsInPhase, setRepsInPhase] = useState(0);

  const phaseTargets = activeExercises.map(exerciseTarget);
  const totalTarget = phaseTargets.reduce((a, b) => a + b, 0);
  const currentExercise = activeExercises[circuitIdx] ?? activeExercises[0];

  function applyDifficulty(preset: DifficultyPreset) {
    setDifficulty(preset);
    if (preset !== 'custom') {
      const cfg = DIFFICULTY_CONFIG[preset];
      setRepsPerUnit(cfg.repsPerUnit);
      setMinutesPerUnit(cfg.minutesPerUnit);
    }
  }

  const earnedMinutes = Math.floor(totalReps / repsPerUnit) * minutesPerUnit;

  const handleSelectEntry = (type: 'pushup' | 'squat' | 'buildOwn') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEntryType(type);
    if (type === 'buildOwn') {
      setPhase('buildYourOwn');
    } else {
      setActiveExercises([type]);
      setPhase('difficulty');
    }
  };

  const handleBuildOwnContinue = (exercises: ExerciseType[]) => {
    setActiveExercises(exercises);
    setPhase('difficulty');
  };

  const handleDifficultySelect = (preset: DifficultyPreset) => {
    applyDifficulty(preset);
    if (preset === 'custom') {
      setPhase('customRatio');
    } else {
      setPhase('duration');
    }
  };

  const handleCustomRatioContinue = () => setPhase('duration');
  const handleDurationContinue = () => setPhase('guideWelcome');
  const handleGuideWelcomeContinue = () => setPhase('guidePosition');
  const handleGuidePositionReady = () => {
    setTotalReps(0);
    setCircuitIdx(0);
    setRepsInPhase(0);
    setPhase('countdown');
  };

  const handleRep = useCallback(() => {
    setRepsInPhase(prev => {
      const next = prev + 1;
      const target = phaseTargets[circuitIdx] ?? 10;

      if (next >= target) {
        // Phase complete
        if (circuitIdx < activeExercises.length - 1) {
          // Move to next circuit phase
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => {
            setTotalReps(t => t + next);
            setCircuitIdx(i => i + 1);
            setRepsInPhase(0);
          }, 400);
        } else {
          // All done
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => {
            setTotalReps(t => t + next);
            setPhase('complete');
          }, 400);
        }
        return next;
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTotalReps(t => t + 1);
        return next;
      }
    });
  }, [circuitIdx, activeExercises, phaseTargets]);

  const handleReset = () => {
    setPhase('select');
    setTotalReps(0);
    setCircuitIdx(0);
    setRepsInPhase(0);
  };

  const handleComplete = async () => {
    if (earnedMinutes > 0) {
      await addMinutes(earnedMinutes);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {phase === 'select' && (
        <SelectionView onSelect={handleSelectEntry} />
      )}

      {phase === 'buildYourOwn' && (
        <BuildYourOwnView
          onContinue={handleBuildOwnContinue}
          onBack={() => setPhase('select')}
        />
      )}

      {phase === 'difficulty' && (
        <DifficultyView
          exercises={activeExercises}
          onSelect={handleDifficultySelect}
          onBack={() => setPhase(entryType === 'buildOwn' ? 'buildYourOwn' : 'select')}
        />
      )}

      {phase === 'customRatio' && (
        <CustomRatioView
          repsPerUnit={repsPerUnit}
          minutesPerUnit={minutesPerUnit}
          onRepsChange={setRepsPerUnit}
          onMinutesChange={setMinutesPerUnit}
          onContinue={handleCustomRatioContinue}
          onBack={() => setPhase('difficulty')}
        />
      )}

      {phase === 'duration' && (
        <DurationView
          selected={durationDays}
          onSelect={setDurationDays}
          onContinue={handleDurationContinue}
          onBack={() => setPhase(difficulty === 'custom' ? 'customRatio' : 'difficulty')}
        />
      )}

      {phase === 'guideWelcome' && (
        <GuideWelcomeView
          exercises={activeExercises}
          difficulty={difficulty}
          repsPerUnit={repsPerUnit}
          minutesPerUnit={minutesPerUnit}
          durationDays={durationDays}
          onContinue={handleGuideWelcomeContinue}
          onBack={() => setPhase('duration')}
        />
      )}

      {phase === 'guidePosition' && (
        <GuidePositionView
          exercises={activeExercises}
          onReady={handleGuidePositionReady}
          onBack={() => setPhase('guideWelcome')}
        />
      )}

      {phase === 'countdown' && (
        <CountdownView
          exercises={activeExercises}
          onComplete={() => setPhase('session')}
          onCancel={handleReset}
        />
      )}

      {phase === 'session' && (
        <SessionView
          exercise={currentExercise}
          exercises={activeExercises}
          circuitIdx={circuitIdx}
          repsInPhase={repsInPhase}
          totalReps={totalReps}
          phaseTargets={phaseTargets}
          totalTarget={totalTarget}
          repsPerUnit={repsPerUnit}
          minutesPerUnit={minutesPerUnit}
          onRep={handleRep}
          onGiveUp={handleReset}
        />
      )}

      {phase === 'complete' && (
        <CompleteView
          exercises={activeExercises}
          totalReps={totalReps}
          earnedMinutes={earnedMinutes}
          durationDays={durationDays}
          onMount={handleComplete}
          onDone={handleReset}
        />
      )}
    </View>
  );
}

// ─── Selection view ───────────────────────────────────────────────────────────

function SelectionView({ onSelect }: { onSelect: (t: 'pushup' | 'squat' | 'buildOwn') => void }) {
  const bankedMinutes = useBankedMinutes(s => s.bankedMinutes);
  const hasAccess = useBankedMinutes(s => s.hasAccess);
  const remaining = useBankedMinutes(s => s.remainingSeconds);
  const tick = useBankedMinutes(s => s.tick);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const t = setInterval(() => { tick(); forceUpdate(n => n + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  const remainSec = remaining();
  const remainMin = Math.floor(remainSec / 60);
  const remainS = remainSec % 60;

  const cards: Array<{ type: 'pushup' | 'squat' | 'buildOwn'; label: string; sub: string; icon: React.ComponentProps<typeof Feather>['name']; color: string }> = [
    { type: 'pushup',   label: 'Pushup to Scroll',  sub: 'Earn up to 3 min per rep',      icon: 'trending-up', color: Colors.accent },
    { type: 'squat',    label: 'Squat to Scroll',   sub: 'Earn up to 3 min per rep',      icon: 'arrow-down',  color: '#6C63FF' },
    { type: 'buildOwn', label: 'Build Your Own',    sub: 'Combine exercises, set ratios', icon: 'sliders',     color: '#FF6B6B' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.selectionScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Challenges</Text>
        <Text style={styles.pageDesc}>Complete a physical challenge to earn app time</Text>
      </View>

      {hasAccess() ? (
        <View style={styles.activeBanner}>
          <Ionicons name="timer" size={18} color={Colors.success} />
          <Text style={styles.activeBannerText}>
            Session active — {remainMin}:{String(remainS).padStart(2, '0')} remaining
          </Text>
        </View>
      ) : bankedMinutes > 0 ? (
        <View style={styles.bankedBanner}>
          <Feather name="zap" size={16} color={Colors.accent} />
          <Text style={styles.bankedBannerText}>{bankedMinutes} min banked — do another challenge to earn more</Text>
        </View>
      ) : (
        <View style={styles.infoBanner}>
          <Feather name="zap" size={16} color={Colors.accent} />
          <Text style={styles.infoBannerText}>
            Complete a challenge to earn minutes. More reps = more scroll time.
          </Text>
        </View>
      )}

      {cards.map(card => (
        <Pressable
          key={card.type}
          onPress={() => onSelect(card.type)}
          style={({ pressed }) => [styles.selCard, pressed && { opacity: 0.82 }]}
        >
          <View style={[styles.selCardAccent, { backgroundColor: card.color }]} />
          <View style={[styles.selCardIcon, { backgroundColor: card.color + '22' }]}>
            <Feather name={card.icon} size={24} color={card.color} />
          </View>
          <View style={styles.selCardBody}>
            <Text style={styles.selCardLabel}>{card.label}</Text>
            <Text style={styles.selCardSub}>{card.sub}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={Colors.textTertiary} />
        </Pressable>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ─── Build your own view ──────────────────────────────────────────────────────

function BuildYourOwnView({ onContinue, onBack }: {
  onContinue: (exercises: ExerciseType[]) => void;
  onBack: () => void;
}) {
  const [pushup, setPushup] = useState(true);
  const [squat, setSquat] = useState(false);
  const canContinue = pushup || squat;

  const toggle = (type: 'pushup' | 'squat') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'pushup') setPushup(p => !p);
    else setSquat(s => !s);
  };

  const handleContinue = () => {
    const exercises: ExerciseType[] = [];
    if (pushup) exercises.push('pushup');
    if (squat) exercises.push('squat');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onContinue(exercises);
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Build Your Own</Text>
      </View>

      <Text style={styles.stepDesc}>Choose which exercises to include. Select both for a circuit challenge.</Text>

      <View style={styles.exerciseToggles}>
        <Pressable
          onPress={() => toggle('pushup')}
          style={[styles.exerciseToggleCard, pushup && { borderColor: Colors.accent, backgroundColor: Colors.accentMuted }]}
        >
          <View style={[styles.exerciseToggleIcon, { backgroundColor: pushup ? Colors.accent + '33' : Colors.surfaceElevated }]}>
            <Feather name="trending-up" size={28} color={pushup ? Colors.accent : Colors.textTertiary} />
          </View>
          <Text style={[styles.exerciseToggleName, pushup && { color: Colors.accent }]}>Pushups</Text>
          <Text style={styles.exerciseToggleSub}>Upper body + core</Text>
          {pushup && (
            <View style={styles.exerciseCheckmark}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={() => toggle('squat')}
          style={[styles.exerciseToggleCard, squat && { borderColor: '#6C63FF', backgroundColor: 'rgba(108,99,255,0.12)' }]}
        >
          <View style={[styles.exerciseToggleIcon, { backgroundColor: squat ? 'rgba(108,99,255,0.2)' : Colors.surfaceElevated }]}>
            <Feather name="arrow-down" size={28} color={squat ? '#6C63FF' : Colors.textTertiary} />
          </View>
          <Text style={[styles.exerciseToggleName, squat && { color: '#6C63FF' }]}>Squats</Text>
          <Text style={styles.exerciseToggleSub}>Legs + glutes</Text>
          {squat && (
            <View style={styles.exerciseCheckmark}>
              <Ionicons name="checkmark-circle" size={22} color="#6C63FF" />
            </View>
          )}
        </Pressable>
      </View>

      {pushup && squat && (
        <View style={styles.circuitBadge}>
          <Feather name="shuffle" size={14} color={Colors.warning} />
          <Text style={styles.circuitBadgeText}>Circuit mode — you'll complete both exercises in sequence</Text>
        </View>
      )}

      <Pressable
        onPress={handleContinue}
        disabled={!canContinue}
        style={[styles.primaryBtn, !canContinue && { opacity: 0.4 }]}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Feather name="arrow-right" size={18} color={Colors.background} />
      </Pressable>
    </View>
  );
}

// ─── Difficulty view ──────────────────────────────────────────────────────────

function DifficultyView({ exercises, onSelect, onBack }: {
  exercises: ExerciseType[];
  onSelect: (preset: DifficultyPreset) => void;
  onBack: () => void;
}) {
  const presets: Array<{ key: Exclude<DifficultyPreset, 'custom'>; desc: string }> = [
    { key: 'easy',    desc: '1 rep earns 3 minutes of app time' },
    { key: 'medium',  desc: '1 rep earns 1 minute of app time' },
    { key: 'hard',    desc: 'Every 3 reps earn 1 minute' },
    { key: 'athlete', desc: 'Every 10 reps earn 1 minute' },
  ];

  const exerciseLabel = exercises.length === 2
    ? 'Pushup + Squat Circuit'
    : exercises[0] === 'pushup' ? 'Pushups' : 'Squats';

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Choose Difficulty</Text>
      </View>

      <View style={styles.exercisePill}>
        <Feather name={exercises[0] === 'pushup' ? 'trending-up' : 'arrow-down'} size={14} color={Colors.accent} />
        <Text style={styles.exercisePillText}>{exerciseLabel}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {presets.map(({ key, desc }) => {
          const cfg = DIFFICULTY_CONFIG[key];
          return (
            <Pressable
              key={key}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSelect(key); }}
              style={({ pressed }) => [styles.diffCard, { borderColor: cfg.color + '44' }, pressed && { opacity: 0.8 }]}
            >
              <View style={[styles.diffCardLeft, { backgroundColor: cfg.color + '22' }]}>
                <Text style={[styles.diffCardLabel, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.diffTagline}>{cfg.tagline}</Text>
                <Text style={styles.diffDesc}>{desc}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.textTertiary} />
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSelect('custom'); }}
          style={({ pressed }) => [styles.diffCard, { borderColor: Colors.accent + '44' }, pressed && { opacity: 0.8 }]}
        >
          <View style={[styles.diffCardLeft, { backgroundColor: Colors.accentMuted }]}>
            <Text style={[styles.diffCardLabel, { color: Colors.accent }]}>Custom</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.diffTagline}>Set your own ratio</Text>
            <Text style={styles.diffDesc}>Define exactly how many reps earn each minute</Text>
          </View>
          <Feather name="chevron-right" size={18} color={Colors.textTertiary} />
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Custom ratio view ────────────────────────────────────────────────────────

const REPS_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 20];
const MINS_OPTIONS = [1, 2, 3, 5, 10, 15, 30];

function CustomRatioView({ repsPerUnit, minutesPerUnit, onRepsChange, onMinutesChange, onContinue, onBack }: {
  repsPerUnit: number;
  minutesPerUnit: number;
  onRepsChange: (n: number) => void;
  onMinutesChange: (n: number) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const repsIdx = REPS_OPTIONS.indexOf(repsPerUnit) >= 0 ? REPS_OPTIONS.indexOf(repsPerUnit) : 0;
  const minsIdx = MINS_OPTIONS.indexOf(minutesPerUnit) >= 0 ? MINS_OPTIONS.indexOf(minutesPerUnit) : 0;

  const adjustReps = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(REPS_OPTIONS.length - 1, repsIdx + dir));
    onRepsChange(REPS_OPTIONS[next]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const adjustMins = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(MINS_OPTIONS.length - 1, minsIdx + dir));
    onMinutesChange(MINS_OPTIONS[next]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Custom Ratio</Text>
      </View>

      <Text style={styles.stepDesc}>Set how many reps it takes to earn each minute of app time.</Text>

      <View style={styles.ratioCard}>
        <View style={styles.ratioCol}>
          <Text style={styles.ratioColLabel}>Reps</Text>
          <Pressable onPress={() => adjustReps(-1)} disabled={repsIdx <= 0} style={[styles.ratioBtn, repsIdx <= 0 && { opacity: 0.3 }]}>
            <Feather name="minus" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.ratioValue}>{repsPerUnit}</Text>
          <Pressable onPress={() => adjustReps(1)} disabled={repsIdx >= REPS_OPTIONS.length - 1} style={[styles.ratioBtn, { backgroundColor: Colors.accentMuted }, repsIdx >= REPS_OPTIONS.length - 1 && { opacity: 0.3 }]}>
            <Feather name="plus" size={20} color={Colors.accent} />
          </Pressable>
        </View>

        <View style={styles.ratioDivider}>
          <Text style={styles.ratioEquals}>=</Text>
        </View>

        <View style={styles.ratioCol}>
          <Text style={styles.ratioColLabel}>Minutes</Text>
          <Pressable onPress={() => adjustMins(-1)} disabled={minsIdx <= 0} style={[styles.ratioBtn, minsIdx <= 0 && { opacity: 0.3 }]}>
            <Feather name="minus" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.ratioValue}>{minutesPerUnit}</Text>
          <Pressable onPress={() => adjustMins(1)} disabled={minsIdx >= MINS_OPTIONS.length - 1} style={[styles.ratioBtn, { backgroundColor: Colors.accentMuted }, minsIdx >= MINS_OPTIONS.length - 1 && { opacity: 0.3 }]}>
            <Feather name="plus" size={20} color={Colors.accent} />
          </Pressable>
        </View>
      </View>

      <View style={styles.ratioSummary}>
        <Text style={styles.ratioSummaryText}>
          Every <Text style={{ color: Colors.accent }}>{repsPerUnit} rep{repsPerUnit !== 1 ? 's' : ''}</Text> earns you{' '}
          <Text style={{ color: Colors.accent }}>{minutesPerUnit} min{minutesPerUnit !== 1 ? 'utes' : 'ute'}</Text> of app access
        </Text>
      </View>

      <Pressable onPress={onContinue} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Feather name="arrow-right" size={18} color={Colors.background} />
      </Pressable>
    </View>
  );
}

// ─── Duration view ────────────────────────────────────────────────────────────

function DurationView({ selected, onSelect, onContinue, onBack }: {
  selected: number;
  onSelect: (d: number) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.stepHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.stepTitle}>Challenge Duration</Text>
      </View>

      <Text style={styles.stepDesc}>How long do you want to run this challenge?</Text>

      <View style={styles.durationGrid}>
        {DURATION_OPTIONS.map(opt => (
          <Pressable
            key={opt.value}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(opt.value); }}
            style={[styles.durationChip, selected === opt.value && styles.durationChipActive]}
          >
            <Text style={[styles.durationChipText, selected === opt.value && styles.durationChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.durationInfo}>
        <Feather name="info" size={14} color={Colors.textTertiary} />
        <Text style={styles.durationInfoText}>
          You will complete one session per day for {selected} day{selected !== 1 ? 's' : ''}.
        </Text>
      </View>

      <Pressable onPress={onContinue} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Feather name="arrow-right" size={18} color={Colors.background} />
      </Pressable>
    </View>
  );
}

// ─── Guide: Welcome ───────────────────────────────────────────────────────────

function GuideWelcomeView({ exercises, difficulty, repsPerUnit, minutesPerUnit, durationDays, onContinue, onBack }: {
  exercises: ExerciseType[];
  difficulty: DifficultyPreset;
  repsPerUnit: number;
  minutesPerUnit: number;
  durationDays: number;
  onContinue: () => void;
  onBack: () => void;
}) {
  const exerciseLabel = exercises.length === 2
    ? 'Push-up + Squat Circuit'
    : exercises[0] === 'pushup' ? 'Push-ups' : 'Squats';

  const diffLabel = difficulty !== 'custom'
    ? DIFFICULTY_CONFIG[difficulty].label
    : 'Custom';

  const totalTarget = exercises.map(exerciseTarget).reduce((a, b) => a + b, 0);
  const maxEarnable = Math.floor(totalTarget / repsPerUnit) * minutesPerUnit;

  return (
    <View style={styles.guideContainer}>
      <Pressable onPress={onBack} style={[styles.backBtn, { alignSelf: 'flex-start' }]} hitSlop={8}>
        <Feather name="arrow-left" size={20} color={Colors.text} />
      </Pressable>

      <View style={styles.guideBadge}>
        <Feather name="zap" size={40} color={Colors.accent} />
      </View>

      <Text style={styles.guideTitle}>You're all set!</Text>
      <Text style={styles.guideSubtitle}>Here's your challenge summary</Text>

      <View style={styles.summaryCard}>
        <SummaryRow icon="activity" label="Exercise" value={exerciseLabel} />
        <View style={styles.summaryDivider} />
        <SummaryRow icon="bar-chart-2" label="Difficulty" value={diffLabel} />
        <View style={styles.summaryDivider} />
        <SummaryRow icon="clock" label="Ratio" value={`${repsPerUnit} rep${repsPerUnit !== 1 ? 's' : ''} = ${minutesPerUnit} min`} />
        <View style={styles.summaryDivider} />
        <SummaryRow icon="calendar" label="Duration" value={`${durationDays} day${durationDays !== 1 ? 's' : ''}`} />
        <View style={styles.summaryDivider} />
        <SummaryRow icon="zap" label="Max earn today" value={`Up to ${maxEarnable} min`} color={Colors.accent} />
      </View>

      <Pressable onPress={onContinue} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Let's Go</Text>
        <Feather name="arrow-right" size={18} color={Colors.background} />
      </Pressable>
    </View>
  );
}

function SummaryRow({ icon, label, value, color }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value: string; color?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Feather name={icon} size={15} color={Colors.textTertiary} />
      <Text style={styles.summaryRowLabel}>{label}</Text>
      <Text style={[styles.summaryRowValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

// ─── Guide: Positioning ───────────────────────────────────────────────────────

function GuidePositionView({ exercises, onReady, onBack }: {
  exercises: ExerciseType[];
  onReady: () => void;
  onBack: () => void;
}) {
  const isPushup = exercises.includes('pushup') && !exercises.includes('squat');
  const isSquat = exercises.includes('squat') && !exercises.includes('pushup');
  const isCircuit = exercises.includes('pushup') && exercises.includes('squat');

  return (
    <View style={styles.guideContainer}>
      <Pressable onPress={onBack} style={[styles.backBtn, { alignSelf: 'flex-start' }]} hitSlop={8}>
        <Feather name="arrow-left" size={20} color={Colors.text} />
      </Pressable>

      <View style={styles.guideBadge}>
        <Feather name="smartphone" size={40} color={Colors.accent} />
      </View>

      <Text style={styles.guideTitle}>Phone Placement</Text>
      <Text style={styles.guideSubtitle}>Position your phone so the camera can see you clearly</Text>

      <View style={styles.positionDiagram}>
        {(isPushup || isCircuit) && (
          <View style={styles.positionStep}>
            <View style={[styles.positionStepNum, { backgroundColor: Colors.accentMuted }]}>
              <Text style={[styles.positionStepNumText, { color: Colors.accent }]}>1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.positionStepTitle}>For Push-ups</Text>
              <Text style={styles.positionStepDesc}>Place phone flat on the floor, front camera facing up. Start in plank above it — your face should pass close to the screen on each rep.</Text>
            </View>
          </View>
        )}
        {(isSquat || isCircuit) && (
          <View style={styles.positionStep}>
            <View style={[styles.positionStepNum, { backgroundColor: 'rgba(108,99,255,0.15)' }]}>
              <Text style={[styles.positionStepNumText, { color: '#6C63FF' }]}>{isCircuit ? '2' : '1'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.positionStepTitle}>For Squats</Text>
              <Text style={styles.positionStepDesc}>Prop phone upright 1.5 m in front of you so your full body is visible from head to toe. Stand facing the camera.</Text>
            </View>
          </View>
        )}
        <View style={styles.positionStep}>
          <View style={[styles.positionStepNum, { backgroundColor: Colors.surfaceElevated }]}>
            <Feather name="sun" size={14} color={Colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.positionStepTitle}>Lighting tip</Text>
            <Text style={styles.positionStepDesc}>Make sure you are in a well-lit area so the camera can detect your movements accurately.</Text>
          </View>
        </View>
      </View>

      <Pressable onPress={onReady} style={styles.primaryBtn}>
        <Feather name="camera" size={18} color={Colors.background} />
        <Text style={styles.primaryBtnText}>I'm Ready</Text>
      </Pressable>
    </View>
  );
}

// ─── Countdown view ───────────────────────────────────────────────────────────

function CountdownView({ exercises, onComplete, onCancel }: {
  exercises: ExerciseType[];
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

  const label = exercises.length === 2 ? 'Circuit Challenge' : exercises[0] === 'pushup' ? 'Pushup to Scroll' : 'Squat to Scroll';

  return (
    <View style={styles.countdownContainer}>
      <Pressable onPress={onCancel} style={styles.countdownCancel} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textTertiary} />
      </Pressable>

      <Text style={[styles.countdownLabel, { color: Colors.accent }]}>{label}</Text>

      <View style={styles.countdownInstruction}>
        <Feather name="info" size={14} color={Colors.textTertiary} />
        <Text style={styles.countdownInstructionText}>Get into position!</Text>
      </View>

      <View style={styles.countdownCircleWrap}>
        <View style={[styles.countdownRing, { borderColor: Colors.accent + '55' }]}>
          <Animated.Text
            style={[
              showGo ? styles.countdownGo : styles.countdownNumber,
              showGo && { color: Colors.accent },
              { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
            ]}
          >
            {showGo ? 'GO!' : count}
          </Animated.Text>
        </View>
      </View>

      <Text style={styles.countdownHint}>{showGo ? 'Starting...' : 'Camera is ready'}</Text>
    </View>
  );
}

// ─── Session view ─────────────────────────────────────────────────────────────

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function SessionView({
  exercise,
  exercises,
  circuitIdx,
  repsInPhase,
  totalReps,
  phaseTargets,
  totalTarget,
  repsPerUnit,
  minutesPerUnit,
  onRep,
  onGiveUp,
}: {
  exercise: ExerciseType;
  exercises: ExerciseType[];
  circuitIdx: number;
  repsInPhase: number;
  totalReps: number;
  phaseTargets: number[];
  totalTarget: number;
  repsPerUnit: number;
  minutesPerUnit: number;
  onRep: () => void;
  onGiveUp: () => void;
}) {
  const isCircuit = exercises.length > 1;
  const currentTarget = phaseTargets[circuitIdx] ?? phaseTargets[0];
  const overallProgress = Math.min(totalReps / totalTarget, 1);
  const strokeOffset = RING_CIRCUMFERENCE * (1 - overallProgress);
  const earnedSoFar = Math.floor(totalReps / repsPerUnit) * minutesPerUnit;

  const phaseLabel = isCircuit
    ? `${exercise === 'pushup' ? 'Push-ups' : 'Squats'} (Phase ${circuitIdx + 1}/${exercises.length})`
    : exercise === 'pushup' ? 'Push-ups' : 'Squats';

  return (
    <View style={styles.sessionContainer}>
      <View style={styles.sessionTopBar}>
        <Pressable onPress={onGiveUp} hitSlop={8} style={styles.giveUpBtn}>
          <Feather name="x" size={16} color={Colors.textTertiary} />
          <Text style={styles.giveUpText}>Give Up</Text>
        </Pressable>
        <Text style={styles.sessionPhaseLabel}>{phaseLabel}</Text>
      </View>

      <View style={styles.repSection}>
        <Svg width={130} height={130} viewBox="0 0 130 130">
          <Circle cx={65} cy={65} r={RING_RADIUS} stroke={Colors.border} strokeWidth={8} fill="none" />
          <Circle
            cx={65} cy={65} r={RING_RADIUS}
            stroke={Colors.accent}
            strokeWidth={8}
            fill="none"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            transform="rotate(-90, 65, 65)"
          />
        </Svg>
        <View style={styles.repOverlay}>
          <Text style={styles.repCount}>{repsInPhase}</Text>
          <Text style={styles.repTarget}>/ {currentTarget}</Text>
        </View>
      </View>

      {earnedSoFar > 0 && (
        <View style={styles.earnedChip}>
          <Feather name="zap" size={13} color={Colors.accent} />
          <Text style={styles.earnedChipText}>{earnedSoFar} min earned so far</Text>
        </View>
      )}

      <View style={styles.trackerWrap}>
        <PoseTracker
          exercise={exercise}
          active
          onRep={onRep}
          onPhaseChange={() => {}}
        />
      </View>
    </View>
  );
}

// ─── Complete view ────────────────────────────────────────────────────────────

function CompleteView({ exercises, totalReps, earnedMinutes, durationDays, onMount, onDone }: {
  exercises: ExerciseType[];
  totalReps: number;
  earnedMinutes: number;
  durationDays: number;
  onMount: () => Promise<void>;
  onDone: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [didSave, setDidSave] = useState(false);

  useEffect(() => {
    onMount().then(() => setDidSave(true));
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const totalTarget = exercises.map(exerciseTarget).reduce((a, b) => a + b, 0);
  const exerciseLabel = exercises.length === 2 ? 'Push-up + Squat Circuit' : exercises[0] === 'pushup' ? 'Push-ups' : 'Squats';

  return (
    <Animated.View style={[styles.completeContainer, { opacity: opacityAnim }]}>
      <Animated.View style={[styles.completeBadge, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.accent} />
      </Animated.View>

      <Text style={styles.completeTitle}>Challenge Complete!</Text>
      <Text style={styles.completeExercise}>{exerciseLabel}</Text>

      <View style={styles.completeStatsRow}>
        <View style={styles.completeStat}>
          <Text style={[styles.completeStatValue, { color: Colors.accent }]}>{totalReps}</Text>
          <Text style={styles.completeStatLabel}>Reps Done</Text>
        </View>
        <View style={styles.completeStatDivider} />
        <View style={styles.completeStat}>
          <Text style={[styles.completeStatValue, { color: Colors.accent }]}>{earnedMinutes}</Text>
          <Text style={styles.completeStatLabel}>Min Earned</Text>
        </View>
        <View style={styles.completeStatDivider} />
        <View style={styles.completeStat}>
          <Text style={[styles.completeStatValue, { color: Colors.success }]}>{durationDays}d</Text>
          <Text style={styles.completeStatLabel}>Challenge</Text>
        </View>
      </View>

      {earnedMinutes > 0 ? (
        <View style={styles.unlockBanner}>
          <Ionicons name="lock-open" size={20} color={Colors.success} />
          <Text style={styles.unlockText}>
            {earnedMinutes} min{earnedMinutes !== 1 ? 'utes' : 'ute'} added to your bank! Open any blocked app to use them.
          </Text>
        </View>
      ) : (
        <View style={[styles.unlockBanner, { backgroundColor: Colors.warningMuted, borderColor: Colors.warning + '33' }]}>
          <Feather name="info" size={18} color={Colors.warning} />
          <Text style={[styles.unlockText, { color: Colors.warning }]}>
            Complete more reps to earn banked minutes next time.
          </Text>
        </View>
      )}

      <Pressable onPress={onDone} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Done</Text>
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
  selectionScroll: { paddingHorizontal: 16, gap: 12 },
  pageHeader: { paddingBottom: 4 },
  pageTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  pageDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.accentMuted, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accent + '33', padding: 12,
  },
  infoBannerText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.accent, flex: 1, lineHeight: 20 },

  bankedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.accentMuted, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.accent + '55', padding: 12,
  },
  bankedBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.accent, flex: 1, lineHeight: 20 },

  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.successMuted, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.success + '44', padding: 12,
  },
  activeBannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.success, flex: 1 },

  selCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    paddingRight: 16, overflow: 'hidden',
  },
  selCardAccent: { width: 5, alignSelf: 'stretch' },
  selCardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
  selCardBody: { flex: 1 },
  selCardLabel: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text },
  selCardSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  // Shared step layout
  stepContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  stepDesc: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Build your own
  exerciseToggles: { flexDirection: 'row', gap: 12 },
  exerciseToggleCard: {
    flex: 1, borderRadius: 16, borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: 'center', padding: 18, gap: 8,
  },
  exerciseToggleIcon: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  exerciseToggleName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.textSecondary },
  exerciseToggleSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textTertiary, textAlign: 'center' },
  exerciseCheckmark: { position: 'absolute', top: 10, right: 10 },
  circuitBadge: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warningMuted, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.warning + '44', padding: 12,
  },
  circuitBadgeText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.warning, flex: 1, lineHeight: 20 },

  exercisePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Colors.accentMuted, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  exercisePillText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.accent },

  // Difficulty
  diffCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1,
    paddingRight: 14, overflow: 'hidden',
  },
  diffCardLeft: { width: 80, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, alignSelf: 'stretch' },
  diffCardLabel: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  diffTagline: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text },
  diffDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },

  // Custom ratio
  ratioCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 24,
  },
  ratioCol: { flex: 1, alignItems: 'center', gap: 14 },
  ratioColLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  ratioBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  ratioValue: { fontFamily: 'Inter_700Bold', fontSize: 40, color: Colors.text },
  ratioDivider: { paddingHorizontal: 16 },
  ratioEquals: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.textTertiary },
  ratioSummary: { backgroundColor: Colors.accentMuted, borderRadius: 12, padding: 14, alignItems: 'center' },
  ratioSummaryText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, lineHeight: 22, textAlign: 'center' },

  // Duration
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  durationChip: {
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
  },
  durationChipActive: { backgroundColor: Colors.accentMuted, borderColor: Colors.accent },
  durationChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.textSecondary },
  durationChipTextActive: { color: Colors.accent },
  durationInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surfaceElevated, borderRadius: 10, padding: 12,
  },
  durationInfoText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textTertiary, flex: 1 },

  // Guide
  guideContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  guideBadge: {
    width: 90, height: 90, borderRadius: 26, backgroundColor: Colors.accentMuted,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    borderWidth: 1, borderColor: Colors.accent + '33',
  },
  guideTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text, textAlign: 'center' },
  guideSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  summaryRowLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, flex: 1 },
  summaryRowValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  summaryDivider: { height: 1, backgroundColor: Colors.borderSubtle, marginHorizontal: 16 },
  positionDiagram: { gap: 14 },
  positionStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  positionStepNum: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  positionStepNumText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  positionStepTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text, marginBottom: 2 },
  positionStepDesc: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Countdown
  countdownContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 32 },
  countdownCancel: { position: 'absolute', top: 16, right: 16, backgroundColor: Colors.surface, borderRadius: 8, padding: 8 },
  countdownLabel: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  countdownInstruction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdownInstructionText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textTertiary },
  countdownCircleWrap: { marginVertical: 20 },
  countdownRing: {
    width: 160, height: 160, borderRadius: 80, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface,
  },
  countdownNumber: { fontFamily: 'Inter_700Bold', fontSize: 80, color: Colors.text },
  countdownGo: { fontFamily: 'Inter_700Bold', fontSize: 52 },
  countdownHint: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textTertiary },

  // Session
  sessionContainer: { flex: 1, paddingHorizontal: 16 },
  sessionTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  giveUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, backgroundColor: Colors.surface, borderRadius: 8 },
  giveUpText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textTertiary },
  sessionPhaseLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.accent },
  repSection: { alignItems: 'center', justifyContent: 'center', marginVertical: 12, position: 'relative' },
  repOverlay: { position: 'absolute', alignItems: 'center' },
  repCount: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.text },
  repTarget: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary },
  earnedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    backgroundColor: Colors.accentMuted, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8,
  },
  earnedChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.accent },
  trackerWrap: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.surface },

  // Complete
  completeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  completeBadge: {
    width: 110, height: 110, borderRadius: 34, backgroundColor: Colors.accentMuted,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.accent + '44',
  },
  completeTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text },
  completeExercise: { fontFamily: 'Inter_500Medium', fontSize: 15, color: Colors.textSecondary },
  completeStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 0, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  completeStat: { flex: 1, alignItems: 'center', gap: 4 },
  completeStatValue: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  completeStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  completeStatDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  unlockBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.successMuted, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.success + '33', padding: 14, width: '100%',
  },
  unlockText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.success, flex: 1, lineHeight: 20 },

  // Shared
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.accent, borderRadius: 16, paddingVertical: 16, marginTop: 4,
  },
  primaryBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.background },
  anotherLink: { marginTop: 4, alignItems: 'center' },
  anotherLinkText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary },
});
