'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Eye,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  TrendingUp,
  Clock,
  FileSearch,
  Flag,
  Search,
  Filter,
  BarChart3,
  Users,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatAddress, formatRelativeTime } from '@/lib/utils';

interface HisbahPageProps {
  params: { locale: string };
}

export default function HisbahPage({ params }: HisbahPageProps) {
  const { locale } = params;
  const t = useTranslations();

  // Mock data
  const stats = {
    totalMonitored: 156,
    activeAlerts: 5,
    flaggedTransactions: 3,
    complianceRate: '98.2%',
    reviewedToday: 24,
    pendingReviews: 8,
  };

  const alerts = [
    {
      id: 'ALT-001',
      type: 'suspicious_pattern',
      severity: 'high',
      contractId: '0x1234...5678',
      description: 'Multiple rapid fund movements detected',
      detectedAt: new Date(Date.now() - 30 * 60 * 1000),
      status: 'pending',
    },
    {
      id: 'ALT-002',
      type: 'unusual_amount',
      severity: 'medium',
      contractId: '0x2345...6789',
      description: 'Transaction amount exceeds normal pattern',
      detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: 'investigating',
    },
    {
      id: 'ALT-003',
      type: 'compliance_risk',
      severity: 'low',
      contractId: '0x3456...7890',
      description: 'Contract terms need Sharia review',
      detectedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      status: 'resolved',
    },
  ];

  const recentActivity = [
    {
      type: 'contract_created',
      contractId: '0x4567...8901',
      actor: '0xaaaa...bbbb',
      timestamp: new Date(Date.now() - 15 * 60 * 1000),
      compliant: true,
    },
    {
      type: 'dispute_raised',
      contractId: '0x5678...9012',
      actor: '0xbbbb...cccc',
      timestamp: new Date(Date.now() - 45 * 60 * 1000),
      compliant: true,
    },
    {
      type: 'fund_release',
      contractId: '0x6789...0123',
      actor: '0xcccc...dddd',
      timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
      compliant: true,
    },
    {
      type: 'arbitration_decision',
      contractId: '0x7890...1234',
      actor: 'Majelis Panel',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      compliant: true,
    },
  ];

  const complianceMetrics = [
    { label: 'Sharia Compliance', value: 98.2, trend: 'up' },
    { label: 'Dispute Resolution Rate', value: 94.5, trend: 'up' },
    { label: 'Average Resolution Time', value: 4.2, unit: 'days', trend: 'down' },
    { label: 'User Satisfaction', value: 4.7, unit: '/5', trend: 'stable' },
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'investigating':
        return 'info';
      case 'resolved':
        return 'success';
      default:
        return 'secondary';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'contract_created':
        return <FileSearch className="w-4 h-4" />;
      case 'dispute_raised':
        return <AlertTriangle className="w-4 h-4" />;
      case 'fund_release':
        return <Wallet className="w-4 h-4" />;
      case 'arbitration_decision':
        return <Shield className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Eye className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('hisbah.title')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {t('hisbah.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
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
                    {t('hisbah.stats.monitored')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.totalMonitored}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className={stats.activeAlerts > 0 ? 'border-red-200 dark:border-red-900/50' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('hisbah.stats.activeAlerts')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.activeAlerts}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
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
                    {t('hisbah.stats.complianceRate')}
                  </p>
                  <p className="text-3xl font-bold text-amantra-green-600 mt-1">
                    {stats.complianceRate}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amantra-green-100 dark:bg-amantra-green-900/30 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-amantra-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('hisbah.stats.pendingReviews')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.pendingReviews}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amantra-gold-100 dark:bg-amantra-gold-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amantra-gold-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    {t('hisbah.alerts.title')}
                  </CardTitle>
                  <CardDescription>{t('hisbah.alerts.description')}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" leftIcon={<Filter className="w-4 h-4" />}>
                    Filter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${
                      alert.severity === 'high'
                        ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/10'
                        : alert.severity === 'medium'
                        ? 'border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-900/10'
                        : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          alert.severity === 'high'
                            ? 'bg-red-100 dark:bg-red-900/30'
                            : alert.severity === 'medium'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30'
                            : 'bg-gray-100 dark:bg-gray-800'
                        }`}>
                          <AlertCircle className={`w-5 h-5 ${
                            alert.severity === 'high'
                              ? 'text-red-600'
                              : alert.severity === 'medium'
                              ? 'text-yellow-600'
                              : 'text-gray-500'
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-gray-500">{alert.id}</span>
                            <Badge variant={getSeverityColor(alert.severity) as any}>
                              {alert.severity}
                            </Badge>
                            <Badge variant={getStatusColor(alert.status) as any}>
                              {alert.status}
                            </Badge>
                          </div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {alert.description}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Contract: <span className="font-mono">{alert.contractId}</span>
                            {' • '}
                            {formatRelativeTime(alert.detectedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline">
                          Investigate
                        </Button>
                        {alert.status === 'pending' && (
                          <Button size="sm">
                            Take Action
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                {t('hisbah.activity.title')}
              </CardTitle>
              <CardDescription>{t('hisbah.activity.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      activity.compliant
                        ? 'bg-amantra-green-100 dark:bg-amantra-green-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {activity.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        <span className="font-mono">{activity.contractId}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatRelativeTime(activity.timestamp)}
                      </p>
                    </div>
                    {activity.compliant ? (
                      <CheckCircle className="w-4 h-4 text-amantra-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Compliance Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              {t('hisbah.metrics.title')}
            </CardTitle>
            <CardDescription>{t('hisbah.metrics.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-6">
              {complianceMetrics.map((metric, index) => (
                <div key={index} className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {metric.label}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {metric.value}
                    {metric.unit && <span className="text-lg text-gray-500">{metric.unit}</span>}
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-2">
                    {metric.trend === 'up' && (
                      <>
                        <TrendingUp className="w-4 h-4 text-amantra-green-500" />
                        <span className="text-sm text-amantra-green-600">Improving</span>
                      </>
                    )}
                    {metric.trend === 'down' && (
                      <>
                        <TrendingUp className="w-4 h-4 text-amantra-green-500 rotate-180" />
                        <span className="text-sm text-amantra-green-600">Improving</span>
                      </>
                    )}
                    {metric.trend === 'stable' && (
                      <span className="text-sm text-gray-500">Stable</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
