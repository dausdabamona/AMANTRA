'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Shield, Github, Twitter, MessageCircle, Mail } from 'lucide-react';

interface FooterProps {
  locale: string;
}

export function Footer({ locale }: FooterProps) {
  const t = useTranslations();
  // Use a fixed year to avoid hydration mismatch between server and client
  const currentYear = 2026;

  const footerLinks = {
    platform: [
      { label: t('nav.about'), href: `/${locale}/about` },
      { label: t('nav.howItWorks'), href: `/${locale}/how-it-works` },
      { label: t('nav.shariaPrinciples'), href: `/${locale}/sharia-principles` },
      { label: t('nav.transparency'), href: `/${locale}/transparency` },
    ],
    governance: [
      { label: t('roles.majelis'), href: `/${locale}/governance/majelis` },
      { label: t('roles.hisbah'), href: `/${locale}/governance/hisbah` },
      { label: t('governance.waqf.title'), href: `/${locale}/governance/waqf` },
      { label: t('governance.succession.title'), href: `/${locale}/governance/succession` },
    ],
    resources: [
      { label: 'API Docs', href: '/docs/api' },
      { label: 'Smart Contracts', href: '/docs/contracts' },
      { label: 'Whitepaper', href: '/whitepaper.pdf' },
      { label: 'FAQ', href: `/${locale}/faq` },
    ],
    legal: [
      { label: 'Privacy Policy', href: `/${locale}/privacy` },
      { label: 'Terms of Service', href: `/${locale}/terms` },
      { label: 'Sharia Compliance', href: `/${locale}/sharia-compliance` },
    ],
  };

  const socialLinks = [
    { icon: Github, href: 'https://github.com/amantra', label: 'GitHub' },
    { icon: Twitter, href: 'https://twitter.com/amantra', label: 'Twitter' },
    { icon: MessageCircle, href: 'https://t.me/amantra', label: 'Telegram' },
    { icon: Mail, href: 'mailto:contact@amantra.io', label: 'Email' },
  ];

  return (
    <footer className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800">
      {/* Main Footer */}
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href={`/${locale}`} className="flex items-center space-x-2 mb-4">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amantra-green-500 to-amantra-green-700 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amantra-gold-500 border-2 border-gray-50 dark:border-gray-900" />
              </div>
              <div>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  AMANTRA
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('common.tagline')}
                </p>
              </div>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md">
              {t('common.description')}
            </p>

            {/* Social Links */}
            <div className="flex items-center space-x-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-gray-400 hover:text-amantra-green-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Platform Links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Platform
            </h4>
            <ul className="space-y-3">
              {footerLinks.platform.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-amantra-green-600 dark:hover:text-amantra-green-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Governance Links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              {t('nav.governance')}
            </h4>
            <ul className="space-y-3">
              {footerLinks.governance.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-amantra-green-600 dark:hover:text-amantra-green-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Resources
            </h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-amantra-green-600 dark:hover:text-amantra-green-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">
              Legal
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-amantra-green-600 dark:hover:text-amantra-green-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {currentYear} AMANTRA. Built with{' '}
              <span className="text-amantra-green-600">Amanah</span> &{' '}
              <span className="text-amantra-gold-500">Justice</span>.
            </p>
            <div className="flex items-center space-x-4">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Powered by Ethereum
              </span>
              <span className="text-gray-300 dark:text-gray-700">•</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Sharia Compliant
              </span>
              <span className="text-gray-300 dark:text-gray-700">•</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Zero Single Point of Failure
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
