import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'bankedMinutes';

interface BankedMinutesState {
  bankedMinutes: number;
  sessionUntil: number | null;
  loadFromStorage: () => Promise<void>;
  addMinutes: (n: number) => Promise<void>;
  grantAccess: () => boolean;
  tick: () => void;
  hasAccess: () => boolean;
  remainingSeconds: () => number;
  reset: () => void;
}

export const useBankedMinutes = create<BankedMinutesState>((set, get) => ({
  bankedMinutes: 0,
  sessionUntil: null,

  loadFromStorage: async () => {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    if (val) set({ bankedMinutes: parseFloat(val) || 0 });
  },

  addMinutes: async (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    const next = Math.round((get().bankedMinutes + rounded) * 100) / 100;
    set({ bankedMinutes: next });
    await AsyncStorage.setItem(STORAGE_KEY, String(next));
  },

  grantAccess: () => {
    const { bankedMinutes } = get();
    if (bankedMinutes <= 0) return false;
    const minutes = Math.max(1, Math.floor(bankedMinutes));
    const until = Date.now() + minutes * 60 * 1000;
    set({ sessionUntil: until, bankedMinutes: 0 });
    AsyncStorage.setItem(STORAGE_KEY, '0');
    return true;
  },

  tick: () => {
    const { sessionUntil } = get();
    if (!sessionUntil) return;
    if (Date.now() >= sessionUntil) {
      set({ sessionUntil: null });
    }
  },

  hasAccess: () => {
    const { sessionUntil } = get();
    if (!sessionUntil) return false;
    return Date.now() < sessionUntil;
  },

  remainingSeconds: () => {
    const { sessionUntil } = get();
    if (!sessionUntil) return 0;
    return Math.max(0, Math.floor((sessionUntil - Date.now()) / 1000));
  },

  reset: () => {
    set({ bankedMinutes: 0, sessionUntil: null });
    AsyncStorage.removeItem(STORAGE_KEY);
  },
}));
