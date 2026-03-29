import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@focusguard_active_challenge';

export type ChallengeType = 'pushup' | 'squat' | 'buildOwn';
export type DifficultyKey = 'easy' | 'medium' | 'hard' | 'athlete' | 'custom';
export type DurType = 'days' | 'weeks' | 'months' | 'infinite';

export type ActiveChallenge = {
  id: string;
  challengeType: ChallengeType;
  challengeLabel: string;
  challengeColor: string;
  difficulty: DifficultyKey;
  repsPerUnit: number;
  minsPerUnit: number;
  durationType: DurType;
  durationValue: number;
  startedAt: string;
  endsAt: string | null;
  totalReps: number;
  totalMinutesBanked: number;
};

type ActiveChallengeStore = {
  challenge: ActiveChallenge | null;
  setChallenge: (c: ActiveChallenge) => void;
  recordSession: (reps: number, minutesBanked: number) => void;
  clearChallenge: () => void;
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

export const useActiveChallenge = create<ActiveChallengeStore>((set, get) => ({
  challenge: null,

  setChallenge: async (c) => {
    set({ challenge: c });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  },

  recordSession: async (reps, minutesBanked) => {
    const prev = get().challenge;
    if (!prev) return;
    const updated: ActiveChallenge = {
      ...prev,
      totalReps: prev.totalReps + reps,
      totalMinutesBanked: prev.totalMinutesBanked + minutesBanked,
    };
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
  challengeType: ChallengeType;
  challengeLabel: string;
  challengeColor: string;
  difficulty: DifficultyKey;
  repsPerUnit: number;
  minsPerUnit: number;
  durationType: DurType;
  durationValue: number;
}): ActiveChallenge {
  return {
    id: Date.now().toString(),
    ...params,
    startedAt: new Date().toISOString(),
    endsAt: computeEndsAt(params.durationType, params.durationValue),
    totalReps: 0,
    totalMinutesBanked: 0,
  };
}
