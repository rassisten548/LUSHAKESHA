import { create } from 'zustand';

export type CharacterType = 'Кеша' | 'Луша';

interface GameState {
  userId: string | null;
  username: string;
  character: CharacterType;
  setUserId: (id: string) => void;
  setUsername: (username: string) => void;
  setCharacter: (character: CharacterType) => void;
}

export const useGameStore = create<GameState>((set) => ({
  userId: null,
  username: '',
  character: 'Кеша',
  setUserId: (id) => set({ userId: id }),
  setUsername: (username) => set({ username }),
  setCharacter: (character) => set({ character }),
}));
