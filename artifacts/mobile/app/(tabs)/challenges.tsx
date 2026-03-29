import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import PoseTracker from '@/components/PoseTracker';
import { useBankedMinutes } from '@/store/bankedMinutesStore';
import {
  useActiveChallenge,
  buildChallenge,
  type ChallengeType,
  type DifficultyKey,
  type DurType,
} from '@/store/activeChallengeStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseId = 'pushup' | 'squat' | 'buildOwn';
type Phase = 'list' | 'guideWelcome' | 'guidePosition' | 'guideSpending' | 'guideBanked' | 'countdown' | 'session' | 'complete';
type ActiveModal = null | 'detail' | 'buildYourOwn' | 'duration';

type ChallengeConfig = {
  id: ExerciseId;
  label: string;
  sub: string;
  color: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BLUE = '#007AFF';

const CHALLENGES: ChallengeConfig[] = [
  { id: 'pushup',   label: 'Pushup to Scroll', sub: '204k active', color: '#3DBE6E' },
  { id: 'squat',    label: 'Squat to Scroll',  sub: '45.4k active', color: '#AB47BC' },
  { id: 'buildOwn', label: 'Build Your Own',   sub: '35.5k active', color: '#FF6D00' },
];

type DifficultyDef = { key: DifficultyKey; label: string; repsPerUnit: number; minsPerUnit: number };
const DIFFICULTIES: DifficultyDef[] = [
  { key: 'easy',    label: 'Easy',    repsPerUnit: 1,  minsPerUnit: 3 },
  { key: 'medium',  label: 'Medium',  repsPerUnit: 1,  minsPerUnit: 1 },
  { key: 'hard',    label: 'Hard',    repsPerUnit: 3,  minsPerUnit: 1 },
  { key: 'athlete', label: 'Athlete', repsPerUnit: 10, minsPerUnit: 1 },
  { key: 'custom',  label: 'Custom',  repsPerUnit: 1,  minsPerUnit: 1 },
];

const DUR_TYPES: DurType[] = ['days', 'weeks', 'months', 'infinite'];
const DUR_LABELS: Record<DurType, string> = { days: 'Days', weeks: 'Weeks', months: 'Months', infinite: 'Infinite' };

const BUILD_OWN_EXERCISES = [
  { id: 'pushup' as ExerciseId, label: 'Pushup to Scroll', sub: 'Every pushup earns a minute', color: '#3DBE6E' },
  { id: 'squat'  as ExerciseId, label: 'Squat to Scroll',  sub: 'Every squat earns a minute',  color: '#AB47BC' },
];

const GUIDE_STEPS = 6;

// Guide images
const GUIDE_IMG_1 = require('../../assets/images/pushup-guide-1.png');
const GUIDE_IMG_2 = require('../../assets/images/pushup-guide-2.png');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEndDate(durType: DurType, durValue: number): string {
  if (durType === 'infinite') return 'No end date';
  const now = new Date();
  const days = durType === 'days' ? durValue : durType === 'weeks' ? durValue * 7 : durValue * 30;
  now.setDate(now.getDate() + days);
  return `Challenge ends on ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function diffDescription(c: ChallengeConfig, diff: DifficultyKey, customReps: number, customMins: number): string {
  const eName = c.id === 'squat' ? 'squat' : 'pushup';
  if (diff === 'custom') return `Every ${customReps} ${eName}${customReps !== 1 ? 's' : ''} earns ${customMins} minute${customMins !== 1 ? 's' : ''}`;
  const d = DIFFICULTIES.find(d => d.key === diff)!;
  if (d.repsPerUnit === 1) return `Every ${eName} earns ${d.minsPerUnit > 1 ? d.minsPerUnit + ' minutes' : 'a minute'}`;
  return `Every ${d.repsPerUnit} ${eName}s earns a minute`;
}

function getDiffValues(diff: DifficultyKey, customReps: number, customMins: number): { repsPerUnit: number; minsPerUnit: number } {
  if (diff === 'custom') return { repsPerUnit: customReps, minsPerUnit: customMins };
  return DIFFICULTIES.find(d => d.key === diff)!;
}

// ─── Inline exercise icons ────────────────────────────────────────────────────

function PushupIcon({ color, size = 24 }: { color: string; size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 32 32">
      {/* Head */}
      <Circle cx={5} cy={11} r={3} stroke={color} strokeWidth={2} fill="none" />
      {/* Body diagonal */}
      <Line x1={8} y1={13} x2={28} y2={22} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      {/* Front arm (elbow bent, close to ground) */}
      <Line x1={12} y1={15} x2={12} y2={21} stroke={color} strokeWidth={2} strokeLinecap="round" />
      {/* Back arm */}
      <Line x1={22} y1={19} x2={22} y2={25} stroke={color} strokeWidth={2} strokeLinecap="round" />
      {/* Floor */}
      <Line x1={4} y1={25} x2={28} y2={25} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}

function SquatIcon({ color, size = 24 }: { color: string; size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 32 32">
      {/* Head */}
      <Circle cx={16} cy={5} r={3} stroke={color} strokeWidth={2} fill="none" />
      {/* Torso (leaning forward) */}
      <Line x1={16} y1={8} x2={14} y2={17} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      {/* Arms forward */}
      <Line x1={15} y1={12} x2={5} y2={14} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={15} y1={12} x2={8} y2={11} stroke={color} strokeWidth={2} strokeLinecap="round" />
      {/* Thighs */}
      <Line x1={14} y1={17} x2={8} y2={22} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Line x1={14} y1={17} x2={22} y2={21} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      {/* Lower legs */}
      <Line x1={8} y1={22} x2={9} y2={28} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={22} y1={21} x2={23} y2={27} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function BuildOwnIcon({ color, size = 24 }: { color: string; size?: number }) {
  return <Ionicons name="barbell" size={size} color={color} />;
}

function ChallengeIcon({ id, color, size = 24 }: { id: ExerciseId; color: string; size?: number }) {
  if (id === 'pushup') return <PushupIcon color={color} size={size} />;
  if (id === 'squat') return <SquatIcon color={color} size={size} />;
  return <BuildOwnIcon color={color} size={size} />;
}

// ─── Progress dashes ──────────────────────────────────────────────────────────

function ProgressDashes({ step }: { step: number }) {
  return (
    <View style={styles.progressDashes}>
      {Array.from({ length: GUIDE_STEPS }).map((_, i) => (
        <View key={i} style={[styles.progressDash, i <= step && styles.progressDashActive]} />
      ))}
    </View>
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const addMinutes = useBankedMinutes(s => s.addMinutes);
  const setActiveChallenge = useActiveChallenge(s => s.setChallenge);
  const recordSession = useActiveChallenge(s => s.recordSession);
  const loadChallenge = useActiveChallenge(s => s.loadFromStorage);

  const [phase, setPhase] = useState<Phase>('list');
  const [modal, setModal] = useState<ActiveModal>(null);
  const [selected, setSelected] = useState<ChallengeConfig | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyKey>('medium');
  const [customReps, setCustomReps] = useState(5);
  const [customMins, setCustomMins] = useState(1);
  const [durType, setDurType] = useState<DurType>('days');
  const [durValue, setDurValue] = useState(5);
  const [byoEnabled, setByoEnabled] = useState<Record<ExerciseId, boolean>>({ pushup: true, squat: true, buildOwn: false });
  const [guideStep, setGuideStep] = useState(0);
  const [reps, setReps] = useState(0);
  const [phaseText, setPhaseText] = useState('');

  useEffect(() => { loadChallenge(); }, []);

  const { repsPerUnit, minsPerUnit } = getDiffValues(difficulty, customReps, customMins);
  const target = selected?.id === 'squat' ? 15 : 10;
  const earnedMinutes = Math.floor(reps / repsPerUnit) * minsPerUnit;

  const handleStart = (c: ChallengeConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(c);
    setDifficulty('medium');
    if (c.id === 'buildOwn') setModal('buildYourOwn');
    else setModal('detail');
  };

  const handleSaveDetail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModal('duration');
  };

  const handleSaveDuration = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModal(null);
    setGuideStep(0);
    setReps(0);
    setPhase('guideWelcome');
  };

  const handleSaveByo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModal('duration');
  };

  const handleRep = useCallback(() => {
    setReps(prev => {
      const next = prev + 1;
      if (next >= target) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setPhase('complete'), 400);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return next;
    });
  }, [target]);

  const handleComplete = async () => {
    if (earnedMinutes > 0) await addMinutes(earnedMinutes);
    await recordSession(reps, earnedMinutes);
  };

  const handleReset = () => {
    setPhase('list');
    setSelected(null);
    setReps(0);
    setModal(null);
  };

  const closeModal = () => setModal(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Save challenge on guide start
  const handleGuideComplete = () => {
    if (!selected) return;
    const { repsPerUnit: rpu, minsPerUnit: mpu } = getDiffValues(difficulty, customReps, customMins);
    const c = buildChallenge({
      challengeType: selected.id as ChallengeType,
      challengeLabel: selected.label,
      challengeColor: selected.color,
      difficulty,
      repsPerUnit: rpu,
      minsPerUnit: mpu,
      durationType: durType,
      durationValue: durValue,
    });
    setActiveChallenge(c);
    setPhase('countdown');
  };

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {phase === 'list' && <ListScreen challenges={CHALLENGES} onStart={handleStart} />}
      {phase === 'guideWelcome' && selected && (
        <GuideWelcome
          challenge={selected}
          durType={durType}
          durValue={durValue}
          guideStep={guideStep}
          onNext={() => { setGuideStep(1); setPhase('guidePosition'); }}
          onClose={handleReset}
        />
      )}
      {phase === 'guidePosition' && selected && (
        <GuidePosition
          challenge={selected}
          guideStep={guideStep}
          onNext={() => { setGuideStep(2); setPhase('guideSpending'); }}
          onClose={handleReset}
        />
      )}
      {phase === 'guideSpending' && (
        <GuideSpending
          guideStep={guideStep}
          onNext={() => { setGuideStep(3); setPhase('guideBanked'); }}
          onClose={handleReset}
        />
      )}
      {phase === 'guideBanked' && (
        <GuideBanked
          guideStep={guideStep}
          onNext={handleGuideComplete}
          onClose={handleReset}
        />
      )}
      {phase === 'countdown' && selected && (
        <CountdownView challenge={selected} onComplete={() => setPhase('session')} onCancel={handleReset} />
      )}
      {phase === 'session' && selected && (
        <SessionView
          challenge={selected}
          reps={reps}
          target={target}
          repsPerUnit={repsPerUnit}
          minsPerUnit={minsPerUnit}
          phaseText={phaseText}
          onRep={handleRep}
          onPhaseChange={setPhaseText}
          onGiveUp={handleReset}
        />
      )}
      {phase === 'complete' && selected && (
        <CompleteView
          challenge={selected}
          reps={reps}
          earnedMinutes={earnedMinutes}
          onMount={handleComplete}
          onDone={handleReset}
        />
      )}

      <DetailSheet
        visible={modal === 'detail'}
        challenge={selected}
        difficulty={difficulty}
        customReps={customReps}
        customMins={customMins}
        onDifficultyChange={setDifficulty}
        onCustomRepsChange={setCustomReps}
        onCustomMinsChange={setCustomMins}
        onSave={handleSaveDetail}
        onClose={closeModal}
      />
      <BuildYourOwnSheet
        visible={modal === 'buildYourOwn'}
        enabled={byoEnabled}
        onToggle={(id) => setByoEnabled(prev => ({ ...prev, [id]: !prev[id] }))}
        onSave={handleSaveByo}
        onClose={closeModal}
      />
      <DurationSheet
        visible={modal === 'duration'}
        challenge={selected}
        durType={durType}
        durValue={durValue}
        onDurTypeChange={setDurType}
        onDurValueChange={setDurValue}
        onStart={handleSaveDuration}
        onClose={closeModal}
      />
    </View>
  );
}

// ─── Active challenge card ────────────────────────────────────────────────────

function MyChallengeCard() {
  const challenge = useActiveChallenge(s => s.challenge);
  const clearChallenge = useActiveChallenge(s => s.clearChallenge);

  if (!challenge) return null;

  const daysLeft = challenge.endsAt
    ? Math.max(0, Math.ceil((new Date(challenge.endsAt).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <View style={[styles.myChallengCard, { borderColor: challenge.challengeColor + '55' }]}>
      <LinearGradient
        colors={[challenge.challengeColor + '22', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.myChallengRow}>
        <View style={[styles.myChallengIcon, { backgroundColor: challenge.challengeColor + '22' }]}>
          <ChallengeIcon id={challenge.challengeType as ExerciseId} color={challenge.challengeColor} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.myChallengLabel}>My Challenge</Text>
          <Text style={[styles.myChallengName, { color: challenge.challengeColor }]}>{challenge.challengeLabel}</Text>
        </View>
        <Pressable onPress={clearChallenge} hitSlop={8}>
          <Feather name="x" size={16} color={Colors.textTertiary} />
        </Pressable>
      </View>

      <View style={styles.myChallengStats}>
        <View style={styles.myChallengStat}>
          <Text style={[styles.myChallengStatVal, { color: challenge.challengeColor }]}>{challenge.totalReps}</Text>
          <Text style={styles.myChallengStatLabel}>Total Reps</Text>
        </View>
        <View style={styles.myChallengDivider} />
        <View style={styles.myChallengStat}>
          <Text style={[styles.myChallengStatVal, { color: Colors.success }]}>{challenge.totalMinutesBanked}</Text>
          <Text style={styles.myChallengStatLabel}>Min Banked</Text>
        </View>
        {daysLeft !== null && (
          <>
            <View style={styles.myChallengDivider} />
            <View style={styles.myChallengStat}>
              <Text style={[styles.myChallengStatVal, { color: Colors.text }]}>{daysLeft}</Text>
              <Text style={styles.myChallengStatLabel}>Days Left</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// ─── List screen ──────────────────────────────────────────────────────────────

function ListScreen({ challenges, onStart }: { challenges: ChallengeConfig[]; onStart: (c: ChallengeConfig) => void }) {
  const bankedMinutes = useBankedMinutes(s => s.bankedMinutes);
  const hasAccess = useBankedMinutes(s => s.hasAccess);
  const remainingSeconds = useBankedMinutes(s => s.remainingSeconds);
  const tick = useBankedMinutes(s => s.tick);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const t = setInterval(() => { tick(); forceUpdate(n => n + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  const remainSec = remainingSeconds();
  const remainMin = Math.floor(remainSec / 60);
  const remainS = remainSec % 60;

  return (
    <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Challenges</Text>
        <Pressable style={styles.joinCodeBtn} hitSlop={4}>
          <Feather name="plus" size={14} color={Colors.text} />
          <Text style={styles.joinCodeText}>Join with code</Text>
        </Pressable>
      </View>

      <Text style={styles.listSubtitle}>Start or join a new challenge</Text>

      <MyChallengeCard />

      {hasAccess() && (
        <View style={styles.sessionActiveBanner}>
          <Ionicons name="timer" size={16} color={Colors.success} />
          <Text style={styles.sessionActiveBannerText}>
            Session active — {remainMin}:{String(remainS).padStart(2, '0')} remaining
          </Text>
        </View>
      )}

      {!hasAccess() && bankedMinutes > 0 && (
        <View style={styles.bankedBanner}>
          <Feather name="zap" size={14} color={Colors.accent} />
          <Text style={styles.bankedBannerText}>{bankedMinutes} min banked — open a blocked app to spend them</Text>
        </View>
      )}

      {challenges.map(c => (
        <Pressable
          key={c.id}
          onPress={() => onStart(c)}
          style={({ pressed }) => [styles.challengeRow, pressed && { opacity: 0.8 }]}
        >
          <View style={[styles.challengeRowIcon, { backgroundColor: c.color + '22' }]}>
            <ChallengeIcon id={c.id} color={c.color} size={22} />
          </View>
          <View style={styles.challengeRowBody}>
            <Text style={styles.challengeRowLabel}>{c.label}</Text>
            <Text style={styles.challengeRowSub}>{c.sub}</Text>
          </View>
          <View style={styles.startBtn}>
            <Text style={styles.startBtnText}>Start</Text>
          </View>
        </Pressable>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

function SheetHeader({ challenge, onClose }: { challenge: ChallengeConfig; onClose: () => void }) {
  return (
    <LinearGradient
      colors={[challenge.color + 'CC', challenge.color + '22', 'transparent']}
      style={styles.sheetGradient}
    >
      <View style={styles.sheetTopRow}>
        <View style={[styles.sheetIconBox, { backgroundColor: challenge.color + '33' }]}>
          <ChallengeIcon id={challenge.id} color={challenge.color} size={22} />
        </View>
        <Pressable onPress={onClose} style={styles.sheetCloseBtn} hitSlop={8}>
          <Feather name="x" size={18} color={Colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={styles.sheetTitle}>{challenge.label}</Text>
    </LinearGradient>
  );
}

function DifficultyStrip({ difficulty, onChange }: { difficulty: DifficultyKey; onChange: (d: DifficultyKey) => void }) {
  return (
    <View style={styles.diffPillStrip}>
      {DIFFICULTIES.map(d => (
        <Pressable
          key={d.key}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(d.key); }}
          style={[styles.diffPill, difficulty === d.key && styles.diffPillActive]}
        >
          <Text style={[styles.diffPillText, difficulty === d.key && styles.diffPillTextActive]}>{d.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Counter({ value, onDecrement, onIncrement }: { value: number; onDecrement: () => void; onIncrement: () => void }) {
  return (
    <View style={styles.counterCard}>
      <Pressable onPress={onDecrement} hitSlop={12}>
        <Text style={styles.counterBtn}>−</Text>
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable onPress={onIncrement} hitSlop={12}>
        <Text style={[styles.counterBtn, { color: Colors.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

// ─── Detail sheet ─────────────────────────────────────────────────────────────

function DetailSheet({ visible, challenge, difficulty, customReps, customMins, onDifficultyChange, onCustomRepsChange, onCustomMinsChange, onSave, onClose }: {
  visible: boolean; challenge: ChallengeConfig | null;
  difficulty: DifficultyKey; customReps: number; customMins: number;
  onDifficultyChange: (d: DifficultyKey) => void;
  onCustomRepsChange: (n: number) => void; onCustomMinsChange: (n: number) => void;
  onSave: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!challenge) return null;
  const isCustom = difficulty === 'custom';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <SheetHeader challenge={challenge} onClose={onClose} />
        <View style={styles.sheetBody}>
          <Text style={styles.sheetSectionLabel}>Difficulty</Text>
          <DifficultyStrip difficulty={difficulty} onChange={onDifficultyChange} />

          {isCustom && (
            <View style={styles.customCountersRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customCounterLabel}>{challenge.id === 'squat' ? 'Squats' : 'Pushups'}</Text>
                <Counter
                  value={customReps}
                  onDecrement={() => { if (customReps > 1) { onCustomRepsChange(customReps - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}}
                  onIncrement={() => { onCustomRepsChange(customReps + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.customCounterLabel}>Minutes Earned</Text>
                <Counter
                  value={customMins}
                  onDecrement={() => { if (customMins > 1) { onCustomMinsChange(customMins - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}}
                  onIncrement={() => { onCustomMinsChange(customMins + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                />
              </View>
            </View>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoCardText}>{diffDescription(challenge, difficulty, customReps, customMins)}</Text>
          </View>
          <Pressable onPress={onSave} style={styles.blueBtn}>
            <Text style={styles.blueBtnText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Build Your Own sheet ─────────────────────────────────────────────────────

function BuildYourOwnSheet({ visible, enabled, onToggle, onSave, onClose }: {
  visible: boolean; enabled: Record<ExerciseId, boolean>;
  onToggle: (id: ExerciseId) => void; onSave: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const byo = CHALLENGES.find(c => c.id === 'buildOwn')!;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <SheetHeader challenge={byo} onClose={onClose} />
        <View style={styles.sheetBody}>
          {BUILD_OWN_EXERCISES.map(ex => (
            <Pressable
              key={ex.id}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle(ex.id); }}
              style={styles.byoRow}
            >
              <View style={[styles.byoRowIcon, { backgroundColor: ex.color + '22' }]}>
                <ChallengeIcon id={ex.id} color={ex.color} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.byoRowLabel}>{ex.label}</Text>
                <Text style={styles.byoRowSub}>{ex.sub}</Text>
              </View>
              <View style={[styles.toggle, enabled[ex.id] && styles.toggleOn]}>
                <View style={[styles.toggleThumb, enabled[ex.id] && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          ))}
          <Pressable onPress={onSave} style={[styles.blueBtn, { marginTop: 8 }]}>
            <Text style={styles.blueBtnText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Duration sheet ───────────────────────────────────────────────────────────

function DurationSheet({ visible, challenge, durType, durValue, onDurTypeChange, onDurValueChange, onStart, onClose }: {
  visible: boolean; challenge: ChallengeConfig | null;
  durType: DurType; durValue: number;
  onDurTypeChange: (t: DurType) => void; onDurValueChange: (n: number) => void;
  onStart: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!challenge) return null;
  const isInfinite = durType === 'infinite';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <SheetHeader challenge={challenge} onClose={onClose} />
        <View style={styles.sheetBody}>
          <Text style={styles.sheetSectionLabel}>Duration</Text>
          <View style={styles.diffPillStrip}>
            {DUR_TYPES.map(dt => (
              <Pressable
                key={dt}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDurTypeChange(dt); }}
                style={[styles.diffPill, durType === dt && styles.diffPillActive]}
              >
                <Text style={[styles.diffPillText, durType === dt && styles.diffPillTextActive]}>{DUR_LABELS[dt]}</Text>
              </Pressable>
            ))}
          </View>

          {!isInfinite && (
            <View style={styles.durPickerCard}>
              <Pressable onPress={() => { if (durValue > 1) { onDurValueChange(durValue - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}} hitSlop={16}>
                <Text style={styles.durPickerBtn}>−</Text>
              </Pressable>
              <Text style={styles.durPickerValue}>{durValue}</Text>
              <Pressable onPress={() => { onDurValueChange(durValue + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={16}>
                <Text style={[styles.durPickerBtn, { color: Colors.text }]}>+</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.endDateText}>{getEndDate(durType, durValue)}</Text>
          <Pressable onPress={onStart} style={styles.blueBtn}>
            <Text style={styles.blueBtnText}>Start New Challenge</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Guide: Welcome ───────────────────────────────────────────────────────────

function GuideWelcome({ challenge, durType, durValue, guideStep, onNext, onClose }: {
  challenge: ChallengeConfig; durType: DurType; durValue: number; guideStep: number;
  onNext: () => void; onClose: () => void;
}) {
  const isInfinite = durType === 'infinite';
  const durLabel = isInfinite ? 'indefinitely' : `the next ${durValue} ${DUR_LABELS[durType].toLowerCase()}`;
  const eName = challenge.id === 'squat' ? 'squats' : 'pushups';

  return (
    <View style={styles.guideScreen}>
      <ProgressDashes step={guideStep} />
      <Pressable onPress={onClose} style={styles.guideCloseBtn} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textSecondary} />
      </Pressable>

      {/* Tapping the icon area advances */}
      <Pressable style={styles.guideCenterContent} onPress={onNext}>
        <View style={[styles.guideLargeIcon, { backgroundColor: challenge.color + '22' }]}>
          <ChallengeIcon id={challenge.id} color={challenge.color} size={44} />
        </View>
        <Text style={styles.guideLargeTitle}>
          Welcome to the{'\n'}{challenge.label}{'\n'}Challenge
        </Text>
        <Text style={styles.guideBody}>
          For {durLabel}, you'll earn minutes on your restricted apps by doing {eName}
        </Text>
        <Text style={styles.guideTapHint}>Tap to continue</Text>
      </Pressable>
    </View>
  );
}

// ─── Guide: Position ─────────────────────────────────────────────────────────

function GuidePosition({ challenge, guideStep, onNext, onClose }: {
  challenge: ChallengeConfig; guideStep: number; onNext: () => void; onClose: () => void;
}) {
  const [imgIndex, setImgIndex] = useState(0);
  const isSquat = challenge.id === 'squat';

  const handleImageTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (imgIndex === 0) {
      setImgIndex(1);
    } else {
      onNext();
    }
  };

  return (
    <View style={styles.guideScreen}>
      <ProgressDashes step={guideStep} />
      <Pressable onPress={onClose} style={styles.guideCloseBtn} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textSecondary} />
      </Pressable>

      <View style={styles.guideCenterContent}>
        <Text style={styles.guidePositionTitle}>{challenge.label}</Text>
        <Text style={styles.guidePositionSub}>
          {isSquat
            ? 'Stand 1.5m in front of your phone with full body visible'
            : 'Record pushups with your front facing camera'}
        </Text>

        {/* Tappable image — first tap goes to image 2, second tap advances */}
        <Pressable onPress={handleImageTap} style={styles.guideImgWrap}>
          {imgIndex === 0 ? (
            isSquat ? (
              <SquatGuideSvg />
            ) : (
              <Image
                source={GUIDE_IMG_1}
                style={styles.guideImg}
                contentFit="contain"
              />
            )
          ) : (
            <Image
              source={GUIDE_IMG_2}
              style={styles.guideImg}
              contentFit="contain"
            />
          )}
          <Text style={styles.guideTapHint}>{imgIndex === 0 ? 'Tap image to see next view' : 'Tap to continue'}</Text>
        </Pressable>

        <Text style={styles.guideLikeThis}>like this</Text>
      </View>
    </View>
  );
}

function SquatGuideSvg() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180">
      <Circle cx={110} cy={28} r={16} stroke="#4488FF" strokeWidth={2.5} fill="none" />
      <Line x1={110} y1={44} x2={110} y2={90} stroke="#4488FF" strokeWidth={2.5} />
      <Line x1={110} y1={60} x2={82} y2={82} stroke="#4488FF" strokeWidth={2} />
      <Line x1={110} y1={60} x2={138} y2={82} stroke="#4488FF" strokeWidth={2} />
      <Line x1={110} y1={90} x2={84} y2={120} stroke="#4488FF" strokeWidth={2.5} />
      <Line x1={110} y1={90} x2={136} y2={120} stroke="#4488FF" strokeWidth={2.5} />
      <Line x1={84} y1={120} x2={84} y2={155} stroke="#4488FF" strokeWidth={2.5} />
      <Line x1={136} y1={120} x2={136} y2={155} stroke="#4488FF" strokeWidth={2.5} />
      <Line x1={55} y1={155} x2={165} y2={155} stroke="#4488FF" strokeWidth={2} />
      {/* Phone upright */}
      <Rect x={178} y={90} width={18} height={32} rx={3} stroke="#4488FF" strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ─── Guide: Spending Minutes ──────────────────────────────────────────────────

function GuideSpending({ guideStep, onNext, onClose }: { guideStep: number; onNext: () => void; onClose: () => void }) {
  return (
    <View style={styles.guideScreen}>
      <ProgressDashes step={guideStep} />
      <Pressable onPress={onClose} style={styles.guideCloseBtn} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textSecondary} />
      </Pressable>
      <Pressable style={styles.guideCenterContent} onPress={onNext}>
        <Text style={styles.guideLargeTitle}>Spending Minutes</Text>
        <Text style={styles.guideBody}>To spend your minutes, go to the app you want to unlock</Text>
        <View style={styles.appGridWrap}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={[styles.appGridCell, i === 4 && styles.appGridCellHighlight]}>
              {i === 4 && <Ionicons name="lock-closed" size={20} color={BLUE} />}
            </View>
          ))}
        </View>
        <Text style={styles.guideBodySmall}>From there you can spend minutes or earn more</Text>
        <Text style={styles.guideTapHint}>Tap to continue</Text>
      </Pressable>
    </View>
  );
}

// ─── Guide: Banked Minutes ────────────────────────────────────────────────────

function GuideBanked({ guideStep, onNext, onClose }: { guideStep: number; onNext: () => void; onClose: () => void }) {
  return (
    <View style={styles.guideScreen}>
      <ProgressDashes step={guideStep} />
      <Pressable onPress={onClose} style={styles.guideCloseBtn} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textSecondary} />
      </Pressable>
      <Pressable style={styles.guideCenterContent} onPress={onNext}>
        <Text style={styles.guideLargeTitle}>Banked Minutes</Text>
        <Text style={[styles.guideBody, { textAlign: 'center' }]}>
          Minutes you don't spend are{' '}
          <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>banked</Text>
          {' '}for later
        </Text>
        <View style={styles.barChartContainer}>
          {[60, 45, 30, 15, 0].map((label, i) => (
            <View key={label} style={styles.barChartRow}>
              <Text style={styles.barChartLabel}>{label}m</Text>
              <View style={[styles.barChartFill, { height: 1, backgroundColor: Colors.border, flex: 1 }]} />
            </View>
          ))}
          <View style={[StyleSheet.absoluteFill, { top: 0, left: 36, right: 0, bottom: 16, borderRadius: 10, backgroundColor: BLUE, opacity: 0.85 }]} />
        </View>
        <Text style={styles.guideTapHint}>Tap to start</Text>
      </Pressable>
    </View>
  );
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function CountdownView({ challenge, onComplete, onCancel }: { challenge: ChallengeConfig; onComplete: () => void; onCancel: () => void }) {
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
            if (n > 1) { pulse(n - 1); }
            else {
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
      <Pressable onPress={onCancel} style={styles.guideCloseBtn} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textSecondary} />
      </Pressable>
      <Text style={[styles.countdownChallengeLabel, { color: challenge.color }]}>{challenge.label}</Text>
      <View style={[styles.countdownRing, { borderColor: challenge.color + '55' }]}>
        <Animated.Text style={[
          showGo ? styles.countdownGo : styles.countdownNumber,
          showGo && { color: challenge.color },
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}>
          {showGo ? 'GO!' : count}
        </Animated.Text>
      </View>
      <Text style={styles.countdownHint}>{showGo ? 'Starting...' : 'Get into position!'}</Text>
    </View>
  );
}

// ─── Session ──────────────────────────────────────────────────────────────────

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

function SessionView({ challenge, reps, target, repsPerUnit, minsPerUnit, phaseText, onRep, onPhaseChange, onGiveUp }: {
  challenge: ChallengeConfig; reps: number; target: number;
  repsPerUnit: number; minsPerUnit: number; phaseText: string;
  onRep: () => void; onPhaseChange: (s: string) => void; onGiveUp: () => void;
}) {
  const progress = Math.min(reps / target, 1);
  const strokeOffset = RING_C * (1 - progress);
  const earned = Math.floor(reps / repsPerUnit) * minsPerUnit;

  return (
    <View style={styles.sessionContainer}>
      <View style={styles.sessionTopBar}>
        <Pressable onPress={onGiveUp} style={styles.giveUpBtn}>
          <Feather name="x" size={14} color={Colors.textTertiary} />
          <Text style={styles.giveUpText}>Give Up</Text>
        </Pressable>
        <Text style={[styles.sessionLabel, { color: challenge.color }]}>{challenge.label}</Text>
      </View>
      <View style={styles.repRingWrap}>
        <Svg width={130} height={130} viewBox="0 0 130 130">
          <Circle cx={65} cy={65} r={RING_R} stroke={Colors.border} strokeWidth={8} fill="none" />
          <Circle cx={65} cy={65} r={RING_R} stroke={challenge.color} strokeWidth={8} fill="none"
            strokeDasharray={RING_C} strokeDashoffset={strokeOffset}
            strokeLinecap="round" transform="rotate(-90, 65, 65)" />
        </Svg>
        <View style={styles.repOverlay}>
          <Text style={styles.repCount}>{reps}</Text>
          <Text style={styles.repTarget}>/ {target}</Text>
        </View>
      </View>
      {earned > 0 && (
        <View style={styles.earnedChip}>
          <Feather name="zap" size={13} color={challenge.color} />
          <Text style={[styles.earnedChipText, { color: challenge.color }]}>{earned} min earned so far</Text>
        </View>
      )}
      <View style={styles.trackerWrap}>
        <PoseTracker exercise={challenge.id === 'squat' ? 'squat' : 'pushup'} active onRep={onRep} onPhaseChange={onPhaseChange} />
      </View>
    </View>
  );
}

// ─── Complete ─────────────────────────────────────────────────────────────────

function CompleteView({ challenge, reps, earnedMinutes, onMount, onDone }: {
  challenge: ChallengeConfig; reps: number; earnedMinutes: number;
  onMount: () => Promise<void>; onDone: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onMount();
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.completeContainer, { opacity: opacityAnim }]}>
      <Animated.View style={[styles.completeBadge, { transform: [{ scale: scaleAnim }], borderColor: challenge.color + '66' }]}>
        <ChallengeIcon id={challenge.id} color={challenge.color} size={52} />
      </Animated.View>
      <Text style={styles.completeTitle}>Challenge Complete!</Text>
      <Text style={[styles.completeChallengeName, { color: challenge.color }]}>{challenge.label}</Text>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: challenge.color }]}>{reps}</Text>
          <Text style={styles.statLabel}>Reps Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: Colors.success }]}>{earnedMinutes}</Text>
          <Text style={styles.statLabel}>Min Earned</Text>
        </View>
      </View>
      {earnedMinutes > 0 && (
        <View style={styles.unlockBanner}>
          <Ionicons name="lock-open" size={18} color={Colors.success} />
          <Text style={styles.unlockBannerText}>
            {earnedMinutes} min added to your bank. Open any blocked app to spend them.
          </Text>
        </View>
      )}
      <Pressable onPress={onDone} style={styles.blueBtn}>
        <Text style={styles.blueBtnText}>Done</Text>
      </Pressable>
      <Pressable onPress={onDone} hitSlop={8} style={{ marginTop: 12, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary }}>Take another challenge</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // List
  listScroll: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 8 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  listTitle: { fontFamily: 'Inter_700Bold', fontSize: 30, color: Colors.text },
  joinCodeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  joinCodeText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text },
  listSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.accent, marginBottom: 16 },

  sessionActiveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.successMuted, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.success + '44', padding: 12, marginBottom: 12,
  },
  sessionActiveBannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.success },
  bankedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accentMuted, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.accent + '33', padding: 12, marginBottom: 12,
  },
  bankedBannerText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.accent },

  challengeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10,
  },
  challengeRowIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  challengeRowBody: { flex: 1 },
  challengeRowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  challengeRowSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  startBtn: { backgroundColor: BLUE, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  startBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

  // My challenge card
  myChallengCard: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    backgroundColor: Colors.surface, padding: 14, marginBottom: 14, gap: 12,
  },
  myChallengRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  myChallengIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  myChallengLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  myChallengName: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  myChallengStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: 12, padding: 12 },
  myChallengStat: { flex: 1, alignItems: 'center', gap: 2 },
  myChallengStatVal: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  myChallengStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary },
  myChallengDivider: { width: 1, height: 36, backgroundColor: Colors.border },

  // Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: '#0D0F13', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetGradient: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  sheetTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  sheetIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  sheetBody: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  sheetSectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text },

  diffPillStrip: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 3, gap: 2 },
  diffPill: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  diffPillActive: { backgroundColor: BLUE },
  diffPillText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  diffPillTextActive: { color: '#fff', fontFamily: 'Inter_700Bold' },

  customCountersRow: { flexDirection: 'row', gap: 12 },
  customCounterLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  counterCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceElevated, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  counterBtn: { fontFamily: 'Inter_400Regular', fontSize: 26, color: Colors.textSecondary, lineHeight: 32 },
  counterValue: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text },

  infoCard: { backgroundColor: Colors.surfaceElevated, borderRadius: 14, padding: 16, alignItems: 'center' },
  infoCardText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text, textAlign: 'center' },

  durPickerCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceElevated, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 18 },
  durPickerBtn: { fontFamily: 'Inter_400Regular', fontSize: 34, color: Colors.textSecondary, lineHeight: 40 },
  durPickerValue: { fontFamily: 'Inter_700Bold', fontSize: 52, color: Colors.text },
  endDateText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  byoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  byoRowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  byoRowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  byoRowSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: Colors.border, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: BLUE },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.textSecondary },
  toggleThumbOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },

  blueBtn: { backgroundColor: BLUE, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  blueBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff' },

  // Guide
  guideScreen: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 32 },
  guideCloseBtn: { position: 'absolute', top: 20, right: 24, width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  progressDashes: { flexDirection: 'row', gap: 6, marginBottom: 0 },
  progressDash: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border },
  progressDashActive: { backgroundColor: Colors.text },

  guideCenterContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  guideLargeIcon: { width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center' },
  guideLargeTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text, textAlign: 'center', lineHeight: 38 },
  guideBody: { fontFamily: 'Inter_400Regular', fontSize: 16, color: '#7AADFF', textAlign: 'center', lineHeight: 26 },
  guideBodySmall: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#7AADFF', textAlign: 'center', lineHeight: 22 },
  guideTapHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textTertiary, marginTop: 4 },

  guidePositionTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text, textAlign: 'center' },
  guidePositionSub: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#7AADFF', textAlign: 'center', lineHeight: 24 },
  guideImgWrap: { alignItems: 'center', justifyContent: 'center' },
  guideImg: { width: 260, height: 160 },
  guideLikeThis: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textSecondary },

  // App grid
  appGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: 230, justifyContent: 'center' },
  appGridCell: { width: 64, height: 64, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  appGridCellHighlight: { borderColor: BLUE, borderWidth: 2, backgroundColor: Colors.surfaceElevated },

  // Bar chart (banked minutes)
  barChartContainer: { width: '100%', height: 140, borderRadius: 12, backgroundColor: Colors.surface, overflow: 'hidden', padding: 12, gap: 0 },
  barChartRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  barChartLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textTertiary, width: 28, textAlign: 'right' },
  barChartFill: {},

  // Countdown
  countdownContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 32 },
  countdownChallengeLabel: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  countdownRing: { width: 160, height: 160, borderRadius: 80, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  countdownNumber: { fontFamily: 'Inter_700Bold', fontSize: 80, color: Colors.text },
  countdownGo: { fontFamily: 'Inter_700Bold', fontSize: 52 },
  countdownHint: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textTertiary },

  // Session
  sessionContainer: { flex: 1, paddingHorizontal: 16 },
  sessionTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  giveUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: Colors.surface, borderRadius: 8 },
  giveUpText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textTertiary },
  sessionLabel: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  repRingWrap: { alignItems: 'center', marginVertical: 12, position: 'relative' },
  repOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  repCount: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.text },
  repTarget: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary },
  earnedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: Colors.surfaceElevated, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  earnedChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  trackerWrap: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.surface },

  // Complete
  completeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  completeBadge: { width: 110, height: 110, borderRadius: 34, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  completeTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text },
  completeChallengeName: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, width: '100%' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 32 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  statDivider: { width: 1, height: 44, backgroundColor: Colors.border },
  unlockBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.successMuted, borderRadius: 14, borderWidth: 1, borderColor: Colors.success + '33', padding: 14, width: '100%' },
  unlockBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.success, flex: 1, lineHeight: 20 },
});
