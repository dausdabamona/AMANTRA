'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  Scale,
  AlertTriangle,
  Settings,
  Wallet,
  History,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWalletStore } from '@/store/wallet';
import { cn, formatAddress } from '@/lib/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default function DashboardLayout({ children, params }: DashboardLayoutProps) {
  const { locale } = params;
  const pathname = usePathname();
  const t = useTranslations();
  const { isConnected, address, balance } = useWalletStore();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navigation = [
    {
      name: t('dashboard.nav.overview'),
      href: `/${locale}/dashboard`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      name: t('dashboard.nav.contracts'),
      href: `/${locale}/dashboard/contracts`,
      icon: FileText,
      badge: 3,
    },
    {
      name: t('dashboard.nav.disputes'),
      href: `/${locale}/dashboard/disputes`,
      icon: AlertTriangle,
      badge: 1,
    },
    {
      name: t('dashboard.nav.arbitration'),
      href: `/${locale}/dashboard/arbitration`,
      icon: Scale,
    },
    {
      name: t('dashboard.nav.history'),
      href: `/${locale}/dashboard/history`,
      icon: History,
    },
    {
      name: t('dashboard.nav.settings'),
      href: `/${locale}/dashboard/settings`,
      icon: Settings,
    },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-20 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          className="bg-white dark:bg-gray-900"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-40 transition-all duration-300 pt-20',
          sidebarCollapsed ? 'w-20' : 'w-64',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Wallet Info */}
        <div className={cn('p-4 border-b border-gray-200 dark:border-gray-800', sidebarCollapsed && 'px-2')}>
          {isConnected ? (
            <div className={cn('flex items-center gap-3', sidebarCollapsed && 'justify-center')}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amantra-green-400 to-amantra-green-600 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {formatAddress(address || '')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {balance} ETH
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className={cn('text-center', sidebarCollapsed && 'hidden')}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {t('dashboard.wallet.notConnected')}
              </p>
              <Button size="sm" className="w-full">
                {t('dashboard.wallet.connect')}
              </Button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-amantra-green-50 dark:bg-amantra-green-900/30 text-amantra-green-700 dark:text-amantra-green-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
                  sidebarCollapsed && 'justify-center px-2'
                )}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', active && 'text-amantra-green-600')} />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1">{item.name}</span>
                    {item.badge && (
                      <Badge variant={active ? 'default' : 'secondary'} className="text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shadow-sm"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          'min-h-screen pt-20 transition-all duration-300',
          sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        )}
      >
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
