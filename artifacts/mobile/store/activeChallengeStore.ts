import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@focusguard_active_challenge_v2';

export type ChallengeType = 'pushup' | 'squat' | 'buildOwn';
export type DifficultyKey = 'easy' | 'medium' | 'hard' | 'athlete' | 'custom';
export type DurType = 'days' | 'weeks' | 'months' | 'infinite';

export type ExerciseStats = {
  type: 'pushup' | 'squat';
  difficulty: DifficultyKey;
  repsPerUnit: number;
  minsPerUnit: number;
  totalReps: number;
};

export type ActiveChallenge = {
  id: string;
  primaryType: ChallengeType;
  challengeLabel: string;
  challengeColor: string;
  exercises: ExerciseStats[];
  durationType: DurType;
  durationValue: number;
  startedAt: string;
  endsAt: string | null;
  totalMinutesBanked: number;
  groupCode: string;
};

type ActiveChallengeStore = {
  challenge: ActiveChallenge | null;
  setChallenge: (c: ActiveChallenge) => Promise<void>;
  recordSession: (exerciseType: 'pushup' | 'squat', reps: number, minutesBanked: number) => Promise<void>;
  addExercise: (entry: ExerciseStats) => Promise<void>;
  clearChallenge: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
};

function computeEndsAt(durationType: DurType, durationValue: number): string | null {
  if (durationType === 'infinite') return null;
  const now = new Date();
  const days =
    durationType === 'days' ? durationValue :
    durationType === 'weeks' ? durationValue * 7 :
    durationValue * 30;
  now.setDate(now.getDate() + days);
  return now.toISOString();
}

function generateGroupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export const useActiveChallenge = create<ActiveChallengeStore>((set, get) => ({
  challenge: null,

  setChallenge: async (c) => {
    set({ challenge: c });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  },

  recordSession: async (exerciseType, reps, minutesBanked) => {
    const prev = get().challenge;
    if (!prev) return;
    const updated: ActiveChallenge = {
      ...prev,
      exercises: prev.exercises.map(e =>
        e.type === exerciseType ? { ...e, totalReps: e.totalReps + reps } : e
      ),
      totalMinutesBanked: prev.totalMinutesBanked + minutesBanked,
    };
    set({ challenge: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  addExercise: async (entry) => {
    const prev = get().challenge;
    if (!prev) return;
    if (prev.exercises.some(e => e.type === entry.type)) return;
    const updated: ActiveChallenge = { ...prev, exercises: [...prev.exercises, entry] };
    set({ challenge: updated });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  clearChallenge: async () => {
    set({ challenge: null });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },

  loadFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ challenge: JSON.parse(raw) as ActiveChallenge });
    } catch (_) {}
  },
}));

export function buildChallenge(params: {
  primaryType: ChallengeType;
  challengeLabel: string;
  challengeColor: string;
  exercises: ExerciseStats[];
  durationType: DurType;
  durationValue: number;
}): ActiveChallenge {
  return {
    id: Date.now().toString(),
    ...params,
    startedAt: new Date().toISOString(),
    endsAt: computeEndsAt(params.durationType, params.durationValue),
    totalMinutesBanked: 0,
    groupCode: generateGroupCode(),
  };
}

// ─── Helpers used by UI ────────────────────────────────────────────────────────

export function challengeProgress(c: ActiveChallenge): number {
  if (!c.endsAt) return 0;
  const total = new Date(c.endsAt).getTime() - new Date(c.startedAt).getTime();
  const elapsed = Date.now() - new Date(c.startedAt).getTime();
  return Math.min(1, Math.max(0, elapsed / total));
}

export function daysLeft(c: ActiveChallenge): number | null {
  if (!c.endsAt) return null;
  return Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000));
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function difficultyLabel(diff: DifficultyKey, repsPerUnit: number, minsPerUnit: number): string {
  const diffNames: Record<DifficultyKey, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', athlete: 'Athlete', custom: 'Custom' };
  return diffNames[diff];
}

export function difficultyDesc(type: 'pushup' | 'squat', repsPerUnit: number, minsPerUnit: number): string {
  const eName = type === 'squat' ? 'squat' : 'pushup';
  if (repsPerUnit === 1) return `Every 1 ${eName} earns ${minsPerUnit > 1 ? minsPerUnit + ' minutes' : 'a minute'}`;
  return `Every ${repsPerUnit} ${eName}s earns ${minsPerUnit > 1 ? minsPerUnit + ' minutes' : 'a minute'}`;
}
