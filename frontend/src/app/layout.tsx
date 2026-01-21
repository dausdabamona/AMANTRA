import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | AMANTRA',
    default: 'AMANTRA - Aman dan Sejahtera',
  },
  description: 'Digital Muamalah Ecosystem - Bank-grade digital contract, escrow, and automated settlement platform with Sharia compliance.',
  keywords: ['escrow', 'smart contract', 'sharia', 'muamalah', 'digital contract', 'blockchain', 'arbitration'],
  authors: [{ name: 'AMANTRA' }],
  creator: 'AMANTRA',
  publisher: 'AMANTRA',
  robots: 'index, follow',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#16a34a' },
    { media: '(prefers-color-scheme: dark)', color: '#15803d' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
