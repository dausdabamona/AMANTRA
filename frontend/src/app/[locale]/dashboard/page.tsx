'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Eye,
  Wallet,
  Shield,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWalletStore } from '@/store/wallet';
import { formatAddress, formatAmount, formatRelativeTime, getStatusColor } from '@/lib/utils';
import { ContractStatus } from '@/types';

interface DashboardPageProps {
  params: { locale: string };
}

export default function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = params;
  const t = useTranslations();
  const { isConnected, address, connect } = useWalletStore();

  // Mock data - replace with real data from smart contract
  const stats = {
    totalContracts: 12,
    activeContracts: 5,
    completedContracts: 6,
    disputedContracts: 1,
    totalValue: '15.5',
    escrowBalance: '3.2',
  };

  const recentContracts = [
    {
      id: '0x1234...5678',
      title: 'Website Development Project',
      counterparty: '0xabcd...efgh',
      amount: '2.5',
      status: ContractStatus.Active,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      role: 'buyer',
    },
    {
      id: '0x2345...6789',
      title: 'Logo Design Services',
      counterparty: '0xbcde...fghi',
      amount: '0.8',
      status: ContractStatus.PendingDelivery,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      role: 'seller',
    },
    {
      id: '0x3456...7890',
      title: 'Consulting Agreement',
      counterparty: '0xcdef...ghij',
      amount: '1.2',
      status: ContractStatus.Disputed,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      role: 'buyer',
    },
  ];

  const pendingActions = [
    {
      type: 'confirm_delivery',
      contract: 'Website Development Project',
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    {
      type: 'respond_dispute',
      contract: 'Consulting Agreement',
      deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  ];

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 rounded-2xl bg-amantra-green-100 dark:bg-amantra-green-900/30 flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-10 h-10 text-amantra-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {t('dashboard.connectWallet.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('dashboard.connectWallet.description')}
          </p>
          <Button onClick={connect} size="lg">
            {t('dashboard.connectWallet.button')}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('dashboard.welcome')}, {formatAddress(address || '')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <Link href={`/${locale}/dashboard/contracts/new`}>
          <Button leftIcon={<Plus className="w-4 h-4" />}>
            {t('dashboard.createContract')}
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.stats.totalContracts')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.totalContracts}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm">
                <ArrowUpRight className="w-4 h-4 text-green-500" />
                <span className="text-green-600">+2</span>
                <span className="text-gray-400">{t('dashboard.stats.thisMonth')}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.stats.activeContracts')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.activeContracts}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amantra-green-100 dark:bg-amantra-green-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amantra-green-600" />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="success" className="text-xs">
                  {stats.completedContracts} {t('dashboard.stats.completed')}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.stats.escrowBalance')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.escrowBalance}
                    <span className="text-lg ml-1">ETH</span>
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amantra-gold-100 dark:bg-amantra-gold-900/30 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-amantra-gold-600" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 text-sm text-gray-400">
                <span>{t('dashboard.stats.secured')}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className={stats.disputedContracts > 0 ? 'border-red-200 dark:border-red-900/50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.stats.disputes')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.disputedContracts}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              {stats.disputedContracts > 0 && (
                <Link href={`/${locale}/dashboard/disputes`}>
                  <div className="flex items-center gap-1 mt-3 text-sm text-red-600 hover:text-red-700">
                    <span>{t('dashboard.stats.viewDisputes')}</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </div>
                </Link>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Contracts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.recentContracts.title')}</CardTitle>
                <CardDescription>{t('dashboard.recentContracts.description')}</CardDescription>
              </div>
              <Link href={`/${locale}/dashboard/contracts`}>
                <Button variant="ghost" size="sm">
                  {t('common.viewAll')}
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentContracts.map((contract, index) => (
                  <div
                    key={contract.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {contract.title}
                        </p>
                        <Badge
                          variant={
                            contract.status === ContractStatus.Active
                              ? 'success'
                              : contract.status === ContractStatus.Disputed
                              ? 'error'
                              : 'warning'
                          }
                          className="text-xs"
                        >
                          {contract.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>
                          {contract.role === 'buyer' ? 'To' : 'From'}: {formatAddress(contract.counterparty)}
                        </span>
                        <span>•</span>
                        <span>{formatRelativeTime(contract.createdAt)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {contract.amount} ETH
                      </p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {contract.role}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Pending Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amantra-gold-600" />
                {t('dashboard.pendingActions.title')}
              </CardTitle>
              <CardDescription>{t('dashboard.pendingActions.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingActions.length > 0 ? (
                <div className="space-y-4">
                  {pendingActions.map((action, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border border-amantra-gold-200 dark:border-amantra-gold-900/50 bg-amantra-gold-50/50 dark:bg-amantra-gold-900/10"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amantra-gold-100 dark:bg-amantra-gold-900/30 flex items-center justify-center flex-shrink-0">
                          {action.type === 'confirm_delivery' ? (
                            <CheckCircle className="w-4 h-4 text-amantra-gold-600" />
                          ) : (
                            <Scale className="w-4 h-4 text-amantra-gold-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {action.type === 'confirm_delivery'
                              ? t('dashboard.pendingActions.confirmDelivery')
                              : t('dashboard.pendingActions.respondDispute')}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                            {action.contract}
                          </p>
                          <p className="text-xs text-amantra-gold-600 mt-1">
                            {t('dashboard.pendingActions.dueIn')} {formatRelativeTime(action.deadline)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboard.pendingActions.empty')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.quickActions.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href={`/${locale}/dashboard/contracts/new`}>
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-amantra-green-300 dark:hover:border-amantra-green-700 hover:bg-amantra-green-50/50 dark:hover:bg-amantra-green-900/10 transition-colors text-center group">
                  <div className="w-12 h-12 rounded-xl bg-amantra-green-100 dark:bg-amantra-green-900/30 flex items-center justify-center mx-auto mb-3 group-hover:bg-amantra-green-200 dark:group-hover:bg-amantra-green-900/50 transition-colors">
                    <Plus className="w-6 h-6 text-amantra-green-600" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {t('dashboard.quickActions.newContract')}
                  </p>
                </div>
              </Link>

              <Link href={`/${locale}/dashboard/contracts`}>
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors text-center group">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                    <Eye className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {t('dashboard.quickActions.viewContracts')}
                  </p>
                </div>
              </Link>

              <Link href={`/${locale}/dashboard/disputes`}>
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors text-center group">
                  <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3 group-hover:bg-red-200 dark:group-hover:bg-red-900/50 transition-colors">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {t('dashboard.quickActions.manageDisputes')}
                  </p>
                </div>
              </Link>

              <Link href={`/${locale}/dashboard/history`}>
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-colors text-center group">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {t('dashboard.quickActions.viewHistory')}
                  </p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
