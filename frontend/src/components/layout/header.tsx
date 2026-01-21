'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  X,
  Sun,
  Moon,
  Globe,
  User as UserIcon,
  ChevronDown,
  Shield,
  Scale,
  Building2,
  Eye,
  Users,
  LogOut,
  LogIn,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/theme';
import { useAuthStore, hasRole } from '@/store/auth';

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const t = useTranslations();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const { theme, toggleTheme } = useThemeStore();
  const { isAuthenticated, user, logout, isLoading } = useAuthStore();

  // Set mounted state after hydration completes
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Handle scroll effect
  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { href: `/${locale}`, label: t('nav.home') },
    { href: `/${locale}/about`, label: t('nav.about') },
    { href: `/${locale}/how-it-works`, label: t('nav.howItWorks') },
    { href: `/${locale}/sharia-principles`, label: t('nav.shariaPrinciples') },
  ];

  // Dashboard items based on user roles
  const getDashboardItems = () => {
    const items: {
      href: string;
      label: string;
      icon: typeof Users;
      badge: string | null;
      roles: readonly string[];
    }[] = [
      {
        href: `/${locale}/dashboard`,
        label: t('roles.user'),
        icon: Users,
        badge: null,
        roles: ['user'] as const,
      },
      {
        href: `/${locale}/dashboard/contracts`,
        label: t('nav.contracts'),
        icon: FileText,
        badge: null,
        roles: ['user'] as const,
      },
    ];

    // Add role-specific items
    if (hasRole('arbitrator')) {
      items.push({
        href: `/${locale}/dashboard/majelis`,
        label: t('roles.majelis'),
        icon: Scale,
        badge: '3',
        roles: ['arbitrator'] as const,
      });
    }

    if (hasRole('hisbah')) {
      items.push({
        href: `/${locale}/dashboard/hisbah`,
        label: t('roles.hisbah'),
        icon: Eye,
        badge: '2',
        roles: ['hisbah'] as const,
      });
    }

    if (hasRole('operator')) {
      items.push({
        href: `/${locale}/dashboard/operator`,
        label: t('roles.operator'),
        icon: Building2,
        badge: null,
        roles: ['operator'] as const,
      });
    }

    return items;
  };

  const dashboardItems = getDashboardItems();

  const handleLogout = async () => {
    await logout();
    setIsMenuOpen(false);
  };

  // Format user display name
  const getUserDisplayName = () => {
    if (!user) return '';
    if (user.name) return user.name;
    if (user.email) return user.email.split('@')[0];
    if (user.phone) return user.phone.replace(/(\+62)(\d{3})(\d+)(\d{4})/, '$1$2****$4');
    return 'User';
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg shadow-sm'
          : 'bg-transparent'
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center space-x-2">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amantra-green-500 to-amantra-green-700 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amantra-gold-500 border-2 border-white dark:border-gray-900" />
            </div>
            <div className="hidden sm:block">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                AMANTRA
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-0.5">
                {t('common.tagline')}
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-amantra-green-600 dark:hover:text-amantra-green-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {item.label}
              </Link>
            ))}

            {/* Dashboard Dropdown - Only show when authenticated */}
            {mounted && isAuthenticated && (
              <div className="relative group">
                <button className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-amantra-green-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  {t('nav.dashboard')}
                  <ChevronDown className="ml-1 w-4 h-4" />
                </button>
                <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-2 min-w-[200px]">
                    {dashboardItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center justify-between px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="flex items-center">
                          <item.icon className="w-4 h-4 mr-2" />
                          {item.label}
                        </span>
                        {item.badge && (
                          <Badge variant="warning" size="sm">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center space-x-2">
            {/* Language Toggle */}
            <Link
              href={locale === 'id' ? '/en' : '/id'}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={t('common.selectLanguage')}
            >
              <Globe className="w-5 h-5" />
            </Link>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={mounted ? (theme === 'dark' ? t('common.lightMode') : t('common.darkMode')) : ''}
            >
              {mounted && theme === 'dark' ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            {/* User Menu / Login Button */}
            {mounted && isAuthenticated ? (
              <div className="hidden sm:flex items-center space-x-2">
                {/* User Info */}
                <Link
                  href={`/${locale}/dashboard/profile`}
                  className="flex items-center px-3 py-1.5 rounded-lg bg-amantra-green-50 dark:bg-amantra-green-900/20 border border-amantra-green-200 dark:border-amantra-green-800 hover:bg-amantra-green-100 dark:hover:bg-amantra-green-900/30 transition-colors"
                >
                  <UserIcon className="w-4 h-4 mr-2 text-amantra-green-600 dark:text-amantra-green-400" />
                  <span className="text-sm font-medium text-amantra-green-700 dark:text-amantra-green-300">
                    {getUserDisplayName()}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  loading={isLoading}
                  title={t('auth.logout')}
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center space-x-2">
                <Link href={`/${locale}/auth/login`}>
                  <Button
                    variant="ghost"
                    size="sm"
                  >
                    {t('auth.login')}
                  </Button>
                </Link>
                <Link href={`/${locale}/auth/register`}>
                  <Button
                    variant="default"
                    size="sm"
                    leftIcon={<LogIn className="w-4 h-4" />}
                  >
                    {t('auth.register')}
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800"
          >
            <div className="container mx-auto px-4 py-4">
              <nav className="flex flex-col space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="px-4 py-3 text-base font-medium text-gray-600 dark:text-gray-300 hover:text-amantra-green-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {item.label}
                  </Link>
                ))}

                {mounted && isAuthenticated && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-2" />
                    <p className="px-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      {t('nav.dashboard')}
                    </p>
                    {dashboardItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center justify-between px-4 py-3 text-base font-medium text-gray-600 dark:text-gray-300 hover:text-amantra-green-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="flex items-center">
                          <item.icon className="w-5 h-5 mr-3" />
                          {item.label}
                        </span>
                        {item.badge && (
                          <Badge variant="warning" size="sm">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    ))}
                  </>
                )}

                <div className="border-t border-gray-100 dark:border-gray-800 my-2" />

                {/* Mobile Auth Buttons */}
                {mounted && isAuthenticated ? (
                  <div className="px-4 py-2">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-500">
                        {t('auth.loggedInAs')}
                      </span>
                      <span className="text-sm font-medium text-amantra-green-600">
                        {getUserDisplayName()}
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        href={`/${locale}/dashboard/profile`}
                        className="flex-1"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <Button variant="outline" className="w-full">
                          {t('auth.profile')}
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        onClick={handleLogout}
                        loading={isLoading}
                      >
                        <LogOut className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 space-y-2">
                    <Link href={`/${locale}/auth/login`} onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        {t('auth.login')}
                      </Button>
                    </Link>
                    <Link href={`/${locale}/auth/register`} onClick={() => setIsMenuOpen(false)}>
                      <Button
                        variant="default"
                        className="w-full"
                        leftIcon={<LogIn className="w-4 h-4" />}
                      >
                        {t('auth.register')}
                      </Button>
                    </Link>
                  </div>
                )}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
