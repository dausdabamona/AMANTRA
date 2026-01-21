'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useThemeStore } from '@/store/theme';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

// Import messages statically for client-side rendering
import idMessages from '../../../messages/id.json';
import enMessages from '../../../messages/en.json';

const messages: Record<string, typeof idMessages> = {
  id: idMessages,
  en: enMessages,
};

interface ClientLayoutProps {
  children: React.ReactNode;
  locale: string;
}

export function ClientLayout({ children, locale }: ClientLayoutProps) {
  const [mounted, setMounted] = useState(false);

  // Only access store after mounting to avoid hydration mismatch
  const theme = useThemeStore((state) => mounted ? state.theme : 'system');

  // Set mounted state after hydration completes
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle theme - only after component is mounted to avoid hydration mismatch
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    const currentTheme = useThemeStore.getState().theme;
    if (currentTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(currentTheme);
    }
  }, [mounted]);

  // Subscribe to theme changes after mounting
  useEffect(() => {
    if (!mounted) return;

    const unsubscribe = useThemeStore.subscribe((state) => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');

      if (state.theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(state.theme);
      }
    });

    return () => unsubscribe();
  }, [mounted]);

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted) return;

    const currentTheme = useThemeStore.getState().theme;
    if (currentTheme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mounted, theme]);

  const currentMessages = messages[locale] || messages['id'];

  return (
    <NextIntlClientProvider locale={locale} messages={currentMessages}>
      <div className="flex min-h-screen flex-col" suppressHydrationWarning>
        <Header locale={locale} />
        <main className="flex-1">{children}</main>
        <Footer locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}
