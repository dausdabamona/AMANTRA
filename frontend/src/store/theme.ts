import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',

      setTheme: (theme) => {
        set({ theme });
        updateDocumentTheme(theme);
      },

      toggleTheme: () => {
        const current = get().theme;
        const next = current === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        updateDocumentTheme(next);
      },
    }),
    {
      name: 'amantra-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          updateDocumentTheme(state.theme);
        }
      },
    }
  )
);

function updateDocumentTheme(theme: Theme) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.classList.toggle('dark', isDark);
}
