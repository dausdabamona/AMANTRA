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
  const { theme } = useThemeStore();

  // Set mounted state after hydration completes
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle theme - only after component is mounted to avoid hydration mismatch
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme, mounted]);

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  const currentMessages = messages[locale] || messages['id'];

  return (
    <NextIntlClientProvider locale={locale} messages={currentMessages}>
      <div className="flex min-h-screen flex-col">
        <Header locale={locale} />
        <main className="flex-1">{children}</main>
        <Footer locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}
