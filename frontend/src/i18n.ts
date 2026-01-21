// Simple i18n config for static export
// Client-side translations are handled by NextIntlClientProvider

export const locales = ['id', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'id';

export const localeNames: Record<Locale, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
};

// For static export, we don't use getRequestConfig
// Instead, messages are loaded directly in the client layout
