import * as Haptics from 'expo-haptics';
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
  Ellipse,
  Line,
  Path,
  Rect,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import PoseTracker from '@/components/PoseTracker';
import { useBankedMinutes } from '@/store/bankedMinutesStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExerciseId = 'pushup' | 'step' | 'reboot' | 'squat' | 'buildOwn';
type DifficultyPreset = 'easy' | 'medium' | 'hard' | 'athlete' | 'custom';
type DurationType = 'days' | 'weeks' | 'months' | 'infinite';
type Phase = 'list' | 'guideWelcome' | 'guidePosition' | 'guideSpending' | 'guideBanked' | 'countdown' | 'session' | 'complete';
type ActiveModal = null | 'detail' | 'buildYourOwn' | 'duration';

type ChallengeConfig = {
  id: ExerciseId;
  label: string;
  sub: string;
  color: string;
  gradient: [string, string];
  FeatherIcon?: React.ComponentProps<typeof Feather>['name'];
  IonicIcon?: React.ComponentProps<typeof Ionicons>['name'];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BLUE = '#007AFF';

const CHALLENGES: ChallengeConfig[] = [
  { id: 'pushup',   label: 'Pushup to Scroll', sub: '204k active', color: '#3DBE6E', gradient: ['#3DBE6E', '#0E0F11'], FeatherIcon: 'trending-up' },
  { id: 'step',     label: 'Step to Scroll',   sub: '32.6k active', color: '#F0A500', gradient: ['#F0A500', '#0E0F11'], IonicIcon: 'walk' },
  { id: 'reboot',   label: 'Project Reboot',   sub: '4.3k active', color: '#00BCD4', gradient: ['#00BCD4', '#0E0F11'], FeatherIcon: 'power' },
  { id: 'squat',    label: 'Squat to Scroll',  sub: '45.4k active', color: '#AB47BC', gradient: ['#AB47BC', '#0E0F11'], FeatherIcon: 'arrow-down' },
  { id: 'buildOwn', label: 'Build Your Own',   sub: '35.5k active', color: '#FF6D00', gradient: ['#FF6D00', '#0E0F11'], IonicIcon: 'barbell' },
];

const DIFFICULTIES: Array<{ key: DifficultyPreset; label: string; repsPerUnit: number; minsPerUnit: number }> = [
  { key: 'easy',    label: 'Easy',    repsPerUnit: 1,  minsPerUnit: 3 },
  { key: 'medium',  label: 'Medium',  repsPerUnit: 1,  minsPerUnit: 1 },
  { key: 'hard',    label: 'Hard',    repsPerUnit: 3,  minsPerUnit: 1 },
  { key: 'athlete', label: 'Athlete', repsPerUnit: 10, minsPerUnit: 1 },
  { key: 'custom',  label: 'Custom',  repsPerUnit: 1,  minsPerUnit: 1 },
];

const DUR_TYPES: DurationType[] = ['days', 'weeks', 'months', 'infinite'];
const DUR_LABELS: Record<DurationType, string> = { days: 'Days', weeks: 'Weeks', months: 'Months', infinite: 'Infinite' };

const BUILD_OWN_EXERCISES: Array<{ id: ExerciseId; label: string; sub: string; color: string; IonicIcon?: React.ComponentProps<typeof Ionicons>['name']; FeatherIcon?: React.ComponentProps<typeof Feather>['name'] }> = [
  { id: 'pushup', label: 'Pushup to Scroll', sub: 'Every pushup earns a minute', color: '#3DBE6E', FeatherIcon: 'trending-up' },
  { id: 'squat',  label: 'Squat to Scroll',  sub: 'Every squat earns a minute',  color: '#AB47BC', FeatherIcon: 'arrow-down' },
  { id: 'step',   label: 'Step to Scroll',   sub: 'Every 100 steps earns a minute', color: '#F0A500', IonicIcon: 'walk' },
];

const GUIDE_STEPS = 6;

function getEndDate(durType: DurationType, durValue: number): string {
  if (durType === 'infinite') return 'No end date';
  const now = new Date();
  const days = durType === 'days' ? durValue : durType === 'weeks' ? durValue * 7 : durValue * 30;
  now.setDate(now.getDate() + days);
  return `Challenge ends on ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function difficultyDescription(c: ChallengeConfig, diff: DifficultyPreset, customReps: number, customMins: number): string {
  const eName = c.id === 'squat' ? 'squat' : c.id === 'step' ? 'step' : 'pushup';
  if (diff === 'custom') return `Every ${customReps} ${eName}${customReps !== 1 ? 's' : ''} earns ${customMins} minute${customMins !== 1 ? 's' : ''}`;
  const d = DIFFICULTIES.find(d => d.key === diff)!;
  if (d.repsPerUnit === 1) return `Every ${eName} earns ${d.minsPerUnit > 1 ? d.minsPerUnit + ' minutes' : 'a minute'}`;
  return `Every ${d.repsPerUnit} ${eName}s earns a minute`;
}

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function ChallengesScreen() {
  const insets = useSafeAreaInsets();
  const addMinutes = useBankedMinutes(s => s.addMinutes);

  const [phase, setPhase] = useState<Phase>('list');
  const [modal, setModal] = useState<ActiveModal>(null);
  const [selected, setSelected] = useState<ChallengeConfig | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyPreset>('medium');
  const [customReps, setCustomReps] = useState(5);
  const [customMins, setCustomMins] = useState(1);
  const [durType, setDurType] = useState<DurationType>('days');
  const [durValue, setDurValue] = useState(5);
  const [byoEnabled, setByoEnabled] = useState<Record<ExerciseId, boolean>>({ pushup: true, squat: true, step: false, reboot: false, buildOwn: false });
  const [guideStep, setGuideStep] = useState(0);
  const [reps, setReps] = useState(0);
  const [phaseText, setPhaseText] = useState('');

  const repsPerUnit = difficulty === 'custom' ? customReps : DIFFICULTIES.find(d => d.key === difficulty)!.repsPerUnit;
  const minsPerUnit = difficulty === 'custom' ? customMins : DIFFICULTIES.find(d => d.key === difficulty)!.minsPerUnit;
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
  };

  const handleReset = () => {
    setPhase('list');
    setSelected(null);
    setReps(0);
    setModal(null);
  };

  const closeModal = () => setModal(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Main phases */}
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
          onNext={() => { setPhase('countdown'); }}
          onClose={handleReset}
        />
      )}
      {phase === 'countdown' && selected && (
        <CountdownView
          challenge={selected}
          onComplete={() => setPhase('session')}
          onCancel={handleReset}
        />
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

      {/* Bottom sheet modals */}
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
          <Text style={styles.bankedBannerText}>{bankedMinutes} min banked — start a challenge to earn more</Text>
        </View>
      )}

      {challenges.map(c => (
        <Pressable
          key={c.id}
          onPress={() => onStart(c)}
          style={({ pressed }) => [styles.challengeRow, pressed && { opacity: 0.8 }]}
        >
          <View style={[styles.challengeRowIcon, { backgroundColor: c.color + '22' }]}>
            {c.FeatherIcon ? (
              <Feather name={c.FeatherIcon} size={22} color={c.color} />
            ) : (
              <Ionicons name={c.IonicIcon as any} size={22} color={c.color} />
            )}
          </View>
          <View style={styles.challengeRowBody}>
            <Text style={styles.challengeRowLabel}>{c.label}</Text>
            <Text style={styles.challengeRowSub}>{c.sub}</Text>
          </View>
          <Pressable onPress={() => onStart(c)} style={styles.startBtn}>
            <Text style={styles.startBtnText}>Start</Text>
          </Pressable>
        </Pressable>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ─── Detail sheet (difficulty + custom ratio) ─────────────────────────────────

function DetailSheet({
  visible, challenge, difficulty, customReps, customMins,
  onDifficultyChange, onCustomRepsChange, onCustomMinsChange, onSave, onClose,
}: {
  visible: boolean;
  challenge: ChallengeConfig | null;
  difficulty: DifficultyPreset;
  customReps: number;
  customMins: number;
  onDifficultyChange: (d: DifficultyPreset) => void;
  onCustomRepsChange: (n: number) => void;
  onCustomMinsChange: (n: number) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!challenge) return null;

  const isCustom = difficulty === 'custom';
  const descText = difficultyDescription(challenge, difficulty, customReps, customMins);
  const eName = challenge.id === 'squat' ? 'squats' : 'pushups';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <LinearGradient
          colors={[challenge.color + 'CC', challenge.color + '22', 'transparent']}
          style={styles.sheetGradient}
        >
          <View style={styles.sheetTopRow}>
            <View style={[styles.sheetIconBox, { backgroundColor: challenge.color + '33' }]}>
              {challenge.FeatherIcon ? (
                <Feather name={challenge.FeatherIcon} size={22} color={challenge.color} />
              ) : (
                <Ionicons name={challenge.IonicIcon as any} size={22} color={challenge.color} />
              )}
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn} hitSlop={8}>
              <Feather name="x" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.sheetTitle}>{challenge.label}</Text>
        </LinearGradient>

        <View style={styles.sheetBody}>
          <Text style={styles.sheetSectionLabel}>Difficulty</Text>

          <View style={styles.diffPillStrip}>
            {DIFFICULTIES.map(d => (
              <Pressable
                key={d.key}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDifficultyChange(d.key); }}
                style={[styles.diffPill, difficulty === d.key && styles.diffPillActive]}
              >
                <Text style={[styles.diffPillText, difficulty === d.key && styles.diffPillTextActive]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {isCustom && (
            <View style={styles.customCountersRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customCounterLabel}>{challenge.id === 'squat' ? 'Squats' : 'Pushups'}</Text>
                <View style={styles.counterCard}>
                  <Pressable onPress={() => { if (customReps > 1) { onCustomRepsChange(customReps - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }} hitSlop={8}>
                    <Text style={styles.counterBtn}>−</Text>
                  </Pressable>
                  <Text style={styles.counterValue}>{customReps}</Text>
                  <Pressable onPress={() => { onCustomRepsChange(customReps + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={8}>
                    <Text style={[styles.counterBtn, { color: Colors.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.customCounterLabel}>Minutes Earned</Text>
                <View style={styles.counterCard}>
                  <Pressable onPress={() => { if (customMins > 1) { onCustomMinsChange(customMins - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }} hitSlop={8}>
                    <Text style={styles.counterBtn}>−</Text>
                  </Pressable>
                  <Text style={styles.counterValue}>{customMins}</Text>
                  <Pressable onPress={() => { onCustomMinsChange(customMins + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={8}>
                    <Text style={[styles.counterBtn, { color: Colors.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoCardText}>{descText}</Text>
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
  visible: boolean;
  enabled: Record<ExerciseId, boolean>;
  onToggle: (id: ExerciseId) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const byo = CHALLENGES.find(c => c.id === 'buildOwn')!;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <LinearGradient
          colors={[byo.color + 'CC', byo.color + '22', 'transparent']}
          style={styles.sheetGradient}
        >
          <View style={styles.sheetTopRow}>
            <View style={[styles.sheetIconBox, { backgroundColor: byo.color + '33' }]}>
              <Ionicons name="barbell" size={22} color={byo.color} />
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn} hitSlop={8}>
              <Feather name="x" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.sheetTitle}>Exercise to Scroll</Text>
        </LinearGradient>

        <View style={styles.sheetBody}>
          {BUILD_OWN_EXERCISES.map(ex => (
            <Pressable
              key={ex.id}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle(ex.id); }}
              style={styles.byoRow}
            >
              <View style={[styles.byoRowIcon, { backgroundColor: ex.color + '22' }]}>
                {ex.FeatherIcon ? (
                  <Feather name={ex.FeatherIcon} size={18} color={ex.color} />
                ) : (
                  <Ionicons name={ex.IonicIcon as any} size={18} color={ex.color} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.byoRowLabel}>{ex.label}</Text>
                <Text style={styles.byoRowSub}>{ex.sub}</Text>
              </View>
              <Feather name="play" size={12} color={Colors.textTertiary} style={{ marginRight: 10 }} />
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
  visible: boolean;
  challenge: ChallengeConfig | null;
  durType: DurationType;
  durValue: number;
  onDurTypeChange: (t: DurationType) => void;
  onDurValueChange: (n: number) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!challenge) return null;
  const isInfinite = durType === 'infinite';
  const endDate = getEndDate(durType, durValue);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
        <LinearGradient
          colors={[challenge.color + 'CC', challenge.color + '22', 'transparent']}
          style={styles.sheetGradient}
        >
          <View style={styles.sheetTopRow}>
            <View style={[styles.sheetIconBox, { backgroundColor: challenge.color + '33' }]}>
              {challenge.FeatherIcon ? (
                <Feather name={challenge.FeatherIcon} size={22} color={challenge.color} />
              ) : (
                <Ionicons name={challenge.IonicIcon as any} size={22} color={challenge.color} />
              )}
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn} hitSlop={8}>
              <Feather name="x" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.sheetTitle}>{challenge.label}</Text>
        </LinearGradient>

        <View style={styles.sheetBody}>
          <Text style={styles.sheetSectionLabel}>Duration</Text>

          <View style={styles.diffPillStrip}>
            {DUR_TYPES.map(dt => (
              <Pressable
                key={dt}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDurTypeChange(dt); }}
                style={[styles.diffPill, durType === dt && styles.diffPillActive]}
              >
                <Text style={[styles.diffPillText, durType === dt && styles.diffPillTextActive]}>
                  {DUR_LABELS[dt]}
                </Text>
              </Pressable>
            ))}
          </View>

          {!isInfinite && (
            <View style={styles.durPickerCard}>
              <Pressable
                onPress={() => { if (durValue > 1) { onDurValueChange(durValue - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } }}
                hitSlop={16}
              >
                <Text style={styles.durPickerBtn}>−</Text>
              </Pressable>
              <Text style={styles.durPickerValue}>{durValue}</Text>
              <Pressable
                onPress={() => { onDurValueChange(durValue + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                hitSlop={16}
              >
                <Text style={[styles.durPickerBtn, { color: Colors.text }]}>+</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.endDateText}>{endDate}</Text>

          <Pressable onPress={onStart} style={styles.blueBtn}>
            <Text style={styles.blueBtnText}>Start New Challenge</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Guide: progress bar ──────────────────────────────────────────────────────

function ProgressDashes({ step }: { step: number }) {
  return (
    <View style={styles.progressDashes}>
      {Array.from({ length: GUIDE_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[styles.progressDash, i <= step && styles.progressDashActive]}
        />
      ))}
    </View>
  );
}

// ─── Guide: Welcome ───────────────────────────────────────────────────────────

function GuideWelcome({ challenge, durType, durValue, guideStep, onNext, onClose }: {
  challenge: ChallengeConfig;
  durType: DurationType;
  durValue: number;
  guideStep: number;
  onNext: () => void;
  onClose: () => void;
}) {
  const isInfinite = durType === 'infinite';
  const durLabel = isInfinite
    ? 'indefinitely'
    : `the next ${durValue} ${DUR_LABELS[durType].toLowerCase()}`;

  const eName = challenge.id === 'squat' ? 'squats' : challenge.id === 'step' ? 'steps' : 'pushups';

  return (
    <View style={styles.guideScreen}>
      <ProgressDashes step={guideStep} />
      <Pressable onPress={onClose} style={styles.guideCloseBtn} hitSlop={8}>
        <Feather name="x" size={18} color={Colors.textSecondary} />
      </Pressable>

      <View style={styles.guideCenterContent}>
        <View style={[styles.guideLargeIcon, { backgroundColor: challenge.color + '22' }]}>
          {challenge.FeatherIcon ? (
            <Feather name={challenge.FeatherIcon} size={44} color={challenge.color} />
          ) : (
            <Ionicons name={challenge.IonicIcon as any} size={44} color={challenge.color} />
          )}
        </View>

        <Text style={styles.guideLargeTitle}>
          Welcome to the{'\n'}{challenge.label}{'\n'}Challenge
        </Text>

        <Text style={styles.guideBody}>
          For {durLabel}, you'll earn minutes on your restricted apps by doing {eName}
        </Text>
      </View>

      <Pressable onPress={onNext} style={styles.guideNextBtn}>
        <Feather name="arrow-right" size={20} color={Colors.background} />
      </Pressable>
    </View>
  );
}

// ─── Guide: Position ─────────────────────────────────────────────────────────

function GuidePosition({ challenge, guideStep, onNext, onClose }: {
  challenge: ChallengeConfig;
  guideStep: number;
  onNext: () => void;
  onClose: () => void;
}) {
  const isSquat = challenge.id === 'squat';

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

        <View style={styles.stickFigureWrap}>
          {isSquat ? <SquatFigureSvg /> : <PushupFigureSvg />}
        </View>

        <Text style={styles.guideLikeThis}>like this</Text>
      </View>

      <Pressable onPress={onNext} style={styles.blueBtn}>
        <Text style={styles.blueBtnText}>Try it</Text>
      </Pressable>
    </View>
  );
}

// ─── Stick figures ────────────────────────────────────────────────────────────

function PushupFigureSvg() {
  return (
    <Svg width={260} height={130} viewBox="0 0 260 130">
      {/* Floor line */}
      <Line x1="10" y1="105" x2="220" y2="105" stroke="#4488FF" strokeWidth="2" />
      {/* Phone (vertical rectangle) */}
      <Rect x="215" y="65" width="20" height="40" rx="3" stroke="#4488FF" strokeWidth="2" fill="none" />
      <Line x1="215" y1="95" x2="235" y2="95" stroke="#4488FF" strokeWidth="1" />

      {/* Body - plank position */}
      {/* Head */}
      <Circle cx="52" cy="60" r="10" stroke="#4488FF" strokeWidth="2" fill="none" />
      {/* Torso */}
      <Line x1="62" y1="64" x2="170" y2="100" stroke="#4488FF" strokeWidth="2.5" />
      {/* Arms */}
      <Line x1="90" y1="73" x2="90" y2="105" stroke="#4488FF" strokeWidth="2.5" />
      <Line x1="145" y1="90" x2="145" y2="105" stroke="#4488FF" strokeWidth="2.5" />
      {/* Legs */}
      <Line x1="170" y1="100" x2="185" y2="100" stroke="#4488FF" strokeWidth="2.5" />
      <Line x1="185" y1="100" x2="185" y2="105" stroke="#4488FF" strokeWidth="2.5" />
    </Svg>
  );
}

function SquatFigureSvg() {
  return (
    <Svg width={260} height={160} viewBox="0 0 260 160">
      {/* Person in squat */}
      {/* Head */}
      <Circle cx="130" cy="35" r="14" stroke="#4488FF" strokeWidth="2.5" fill="none" />
      {/* Torso */}
      <Line x1="130" y1="49" x2="130" y2="90" stroke="#4488FF" strokeWidth="2.5" />
      {/* Arms */}
      <Line x1="130" y1="60" x2="100" y2="80" stroke="#4488FF" strokeWidth="2" />
      <Line x1="130" y1="60" x2="160" y2="80" stroke="#4488FF" strokeWidth="2" />
      {/* Thighs (bent) */}
      <Line x1="130" y1="90" x2="100" y2="120" stroke="#4488FF" strokeWidth="2.5" />
      <Line x1="130" y1="90" x2="160" y2="120" stroke="#4488FF" strokeWidth="2.5" />
      {/* Lower legs */}
      <Line x1="100" y1="120" x2="100" y2="150" stroke="#4488FF" strokeWidth="2.5" />
      <Line x1="160" y1="120" x2="160" y2="150" stroke="#4488FF" strokeWidth="2.5" />
      {/* Floor */}
      <Line x1="70" y1="150" x2="190" y2="150" stroke="#4488FF" strokeWidth="2" />
      {/* Phone propped on side */}
      <Rect x="215" y="90" width="18" height="32" rx="3" stroke="#4488FF" strokeWidth="2" fill="none" />
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

      <View style={styles.guideCenterContent}>
        <Text style={styles.guideLargeTitle}>Spending Minutes</Text>
        <Text style={styles.guideBody}>
          To spend your minutes, go to the app you want to unlock
        </Text>

        <View style={styles.appGridWrap}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.appGridCell,
                i === 4 && styles.appGridCellHighlight,
              ]}
            >
              {i === 4 && <Ionicons name="lock-closed" size={20} color={BLUE} />}
            </View>
          ))}
        </View>

        <Text style={styles.guideBodySmall}>
          From there you can spend minutes or earn more
        </Text>
      </View>

      <Pressable onPress={onNext} style={styles.guideNextBtn}>
        <Feather name="arrow-right" size={20} color={Colors.background} />
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

      <View style={styles.guideCenterContent}>
        <Text style={styles.guideLargeTitle}>Banked Minutes</Text>
        <Text style={[styles.guideBody, { textAlign: 'center' }]}>
          Minutes you don't spend are{' '}
          <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>banked</Text>
          {' '}for later
        </Text>

        <View style={styles.barChartWrap}>
          <Svg width="100%" height={160} viewBox="0 0 300 160">
            {/* Y-axis labels */}
            {['60m', '45m', '30m', '15m', '0m'].map((label, i) => (
              <Path key={label} d={`M 48 ${20 + i * 32} H 280`} stroke="#2A2B33" strokeWidth="1" />
            ))}
            {/* Blue fill bar */}
            <Rect x="48" y="52" width="232" height="108" rx="8" fill={BLUE} />
            {/* Y-axis text */}
            {['60m', '45m', '30m', '15m', '0m'].map((label, i) => (
              <Path key={label} d="" />
            ))}
          </Svg>
          <View style={styles.barChartLabels}>
            {['60m', '45m', '30m', '15m', '0m'].map((label, i) => (
              <Text key={label} style={styles.barChartLabel}>{label}</Text>
            ))}
          </View>
        </View>
      </View>

      <Pressable onPress={onNext} style={styles.blueBtn}>
        <Text style={styles.blueBtnText}>Got it</Text>
      </Pressable>
    </View>
  );
}

// ─── Countdown view ───────────────────────────────────────────────────────────

function CountdownView({ challenge, onComplete, onCancel }: {
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

// ─── Session view ─────────────────────────────────────────────────────────────

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

function SessionView({ challenge, reps, target, repsPerUnit, minsPerUnit, phaseText, onRep, onPhaseChange, onGiveUp }: {
  challenge: ChallengeConfig;
  reps: number;
  target: number;
  repsPerUnit: number;
  minsPerUnit: number;
  phaseText: string;
  onRep: () => void;
  onPhaseChange: (s: string) => void;
  onGiveUp: () => void;
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
        <PoseTracker
          exercise={challenge.id === 'squat' ? 'squat' : 'pushup'}
          active
          onRep={onRep}
          onPhaseChange={onPhaseChange}
        />
      </View>
    </View>
  );
}

// ─── Complete view ────────────────────────────────────────────────────────────

function CompleteView({ challenge, reps, earnedMinutes, onMount, onDone }: {
  challenge: ChallengeConfig;
  reps: number;
  earnedMinutes: number;
  onMount: () => Promise<void>;
  onDone: () => void;
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
        {challenge.FeatherIcon ? (
          <Feather name={challenge.FeatherIcon} size={56} color={challenge.color} />
        ) : (
          <Ionicons name={challenge.IonicIcon as any} size={56} color={challenge.color} />
        )}
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
            {earnedMinutes} min added to your bank. Open any blocked app to use them.
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
    borderWidth: 1, borderColor: Colors.success + '44',
    padding: 12, marginBottom: 12,
  },
  sessionActiveBannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.success },
  bankedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accentMuted, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.accent + '33',
    padding: 12, marginBottom: 12,
  },
  bankedBannerText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.accent },

  challengeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, marginBottom: 10,
  },
  challengeRowIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  challengeRowBody: { flex: 1 },
  challengeRowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  challengeRowSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  startBtn: { backgroundColor: BLUE, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  startBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' },

  // Sheet modal
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#0D0F13',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  sheetGradient: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  sheetTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  sheetIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCloseBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  sheetBody: { paddingHorizontal: 20, paddingTop: 8, gap: 14 },
  sheetSectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text },

  // Difficulty / duration pill strip
  diffPillStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 3, gap: 2,
  },
  diffPill: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  diffPillActive: { backgroundColor: BLUE },
  diffPillText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  diffPillTextActive: { color: '#fff', fontFamily: 'Inter_700Bold' },

  // Custom counters
  customCountersRow: { flexDirection: 'row', gap: 12 },
  customCounterLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  counterCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  counterBtn: { fontFamily: 'Inter_400Regular', fontSize: 26, color: Colors.textSecondary, lineHeight: 32 },
  counterValue: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.text },

  // Info card
  infoCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 14,
    padding: 16, alignItems: 'center',
  },
  infoCardText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text, textAlign: 'center' },

  // Duration picker
  durPickerCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated, borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 18,
  },
  durPickerBtn: { fontFamily: 'Inter_400Regular', fontSize: 34, color: Colors.textSecondary, lineHeight: 40 },
  durPickerValue: { fontFamily: 'Inter_700Bold', fontSize: 52, color: Colors.text },
  endDateText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  // Build your own
  byoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  byoRowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  byoRowLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.text },
  byoRowSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: Colors.border, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: BLUE },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.textSecondary },
  toggleThumbOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },

  // Blue button (shared)
  blueBtn: { backgroundColor: BLUE, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  blueBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#fff' },

  // Guide screens
  guideScreen: {
    flex: 1, backgroundColor: Colors.background, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 32,
  },
  guideCloseBtn: {
    position: 'absolute', top: 20, right: 24,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  progressDashes: { flexDirection: 'row', gap: 6, marginBottom: 0 },
  progressDash: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border },
  progressDashActive: { backgroundColor: Colors.text },

  guideCenterContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  guideLargeIcon: {
    width: 110, height: 110, borderRadius: 55, alignItems: 'center', justifyContent: 'center',
  },
  guideLargeTitle: {
    fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text, textAlign: 'center', lineHeight: 38,
  },
  guideBody: { fontFamily: 'Inter_400Regular', fontSize: 16, color: '#7AADFF', textAlign: 'center', lineHeight: 26 },
  guideBodySmall: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#7AADFF', textAlign: 'center', lineHeight: 22 },

  guidePositionTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text, textAlign: 'center' },
  guidePositionSub: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#7AADFF', textAlign: 'center', lineHeight: 24 },
  stickFigureWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  guideLikeThis: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textSecondary },

  guideNextBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: BLUE,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },

  // App grid (spending minutes)
  appGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: 230, justifyContent: 'center' },
  appGridCell: {
    width: 64, height: 64, borderRadius: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  appGridCellHighlight: {
    borderColor: BLUE, borderWidth: 2,
    backgroundColor: Colors.surfaceElevated,
  },

  // Bar chart
  barChartWrap: { width: '100%', position: 'relative', height: 160 },
  barChartLabels: {
    position: 'absolute', left: 0, top: 10, bottom: 0,
    justifyContent: 'space-between', paddingBottom: 10,
  },
  barChartLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textTertiary },

  // Countdown
  countdownContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 32 },
  countdownChallengeLabel: { fontFamily: 'Inter_700Bold', fontSize: 18 },
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
  giveUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: Colors.surface, borderRadius: 8 },
  giveUpText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textTertiary },
  sessionLabel: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  repRingWrap: { alignItems: 'center', marginVertical: 12, position: 'relative' },
  repOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  repCount: { fontFamily: 'Inter_700Bold', fontSize: 32, color: Colors.text },
  repTarget: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary },
  earnedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8,
  },
  earnedChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  trackerWrap: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.surface },

  // Complete
  completeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  completeBadge: {
    width: 110, height: 110, borderRadius: 34, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  completeTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text },
  completeChallengeName: { fontFamily: 'Inter_500Medium', fontSize: 15 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    padding: 20, gap: 0, width: '100%',
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 32 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  statDivider: { width: 1, height: 44, backgroundColor: Colors.border },
  unlockBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.successMuted, borderRadius: 14, borderWidth: 1, borderColor: Colors.success + '33',
    padding: 14, width: '100%',
  },
  unlockBannerText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.success, flex: 1, lineHeight: 20 },
});
