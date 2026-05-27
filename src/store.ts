import { create } from 'zustand';

export type CharacterType = 'Кеша' | 'Луша';

interface GameState {
  userId: string;
  username: string;
  character: CharacterType;
  setUserId: (id: string) => void;
  setUsername: (username: string) => void;
  setCharacter: (character: CharacterType) => void;
}

const getInitialUserId = (): string => {
  let id = sessionStorage.getItem('parrot_run_user_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('parrot_run_user_id', id);
  }
  return id;
};

const getInitialUsername = (): string => {
  return localStorage.getItem('parrot_run_username') || '';
};

const getInitialCharacter = (): CharacterType => {
  const char = localStorage.getItem('parrot_run_character');
  return (char === 'Кеша' || char === 'Луша') ? char : 'Кеша';
};

export const useGameStore = create<GameState>((set) => ({
  userId: getInitialUserId(),
  username: getInitialUsername(),
  character: getInitialCharacter(),
  setUserId: (id) => {
    sessionStorage.setItem('parrot_run_user_id', id);
    set({ userId: id });
  },
  setUsername: (username) => {
    localStorage.setItem('parrot_run_username', username);
    set({ username });
  },
  setCharacter: (character) => {
    localStorage.setItem('parrot_run_character', character);
    set({ character });
  },
}));

