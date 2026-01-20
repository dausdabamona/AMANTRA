import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const locales = ['id', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'id';

export const localeNames: Record<Locale, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
};

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as Locale)) notFound();

  return {
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
