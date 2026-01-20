'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Scale,
  Users,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Gavel,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  MoreVertical,
  Filter,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatAddress, formatRelativeTime } from '@/lib/utils';

interface MajelisPageProps {
  params: { locale: string };
}

export default function MajelisPage({ params }: MajelisPageProps) {
  const { locale } = params;
  const t = useTranslations();

  // Mock data for arbitration cases
  const stats = {
    assignedCases: 8,
    pendingReview: 3,
    awaitingDecision: 2,
    completedThisMonth: 12,
    averageResolutionTime: '4.2 days',
    approvalRate: '94%',
  };

  const assignedCases = [
    {
      id: 'DISP-2024-001',
      contractId: '0x1234...5678',
      title: 'Website Development Dispute',
      claimant: '0xaaaa...bbbb',
      respondent: '0xcccc...dddd',
      amount: '2.5',
      status: 'pending_review',
      assignedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      priority: 'high',
      panelMembers: ['You', '0xeeee...ffff', '0xgggg...hhhh'],
    },
    {
      id: 'DISP-2024-002',
      contractId: '0x2345...6789',
      title: 'Service Quality Issue',
      claimant: '0xbbbb...cccc',
      respondent: '0xdddd...eeee',
      amount: '1.8',
      status: 'evidence_review',
      assignedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      priority: 'medium',
      panelMembers: ['You', '0xffff...gggg', '0xhhhh...iiii'],
    },
    {
      id: 'DISP-2024-003',
      contractId: '0x3456...7890',
      title: 'Payment Delay Claim',
      claimant: '0xcccc...dddd',
      respondent: '0xeeee...ffff',
      amount: '0.9',
      status: 'awaiting_vote',
      assignedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      priority: 'urgent',
      panelMembers: ['You', '0xgggg...hhhh', '0xiiii...jjjj'],
    },
  ];

  const recentDecisions = [
    {
      id: 'DISP-2024-000',
      title: 'Logo Design Dispute',
      decision: 'favor_claimant',
      amount: '0.5',
      resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      yourVote: 'favor_claimant',
    },
    {
      id: 'DISP-2023-099',
      title: 'Consulting Contract Issue',
      decision: 'split_50_50',
      amount: '1.2',
      resolvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      yourVote: 'split_50_50',
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="warning">Pending Review</Badge>;
      case 'evidence_review':
        return <Badge variant="info">Evidence Review</Badge>;
      case 'awaiting_vote':
        return <Badge variant="gold">Awaiting Vote</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="error">Urgent</Badge>;
      case 'high':
        return <Badge variant="warning">High</Badge>;
      case 'medium':
        return <Badge variant="info">Medium</Badge>;
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amantra-gold-100 dark:bg-amantra-gold-900/30 flex items-center justify-center">
            <Scale className="w-5 h-5 text-amantra-gold-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('majelis.title')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {t('majelis.subtitle')}
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
                    {t('majelis.stats.assignedCases')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.assignedCases}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
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
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('majelis.stats.pendingReview')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.pendingReview}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amantra-gold-100 dark:bg-amantra-gold-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amantra-gold-600" />
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
                    {t('majelis.stats.completedMonth')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.completedThisMonth}
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
                    {t('majelis.stats.avgResolution')}
                  </p>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
                    {stats.averageResolutionTime}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Assigned Cases */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-amantra-gold-600" />
                  {t('majelis.assignedCases.title')}
                </CardTitle>
                <CardDescription>{t('majelis.assignedCases.description')}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search cases..." className="pl-10 w-48" />
                </div>
                <Button variant="outline" size="sm" leftIcon={<Filter className="w-4 h-4" />}>
                  Filter
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assignedCases.map((case_, index) => (
                <div
                  key={case_.id}
                  className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-amantra-gold-300 dark:hover:border-amantra-gold-700 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Case Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
                          {case_.id}
                        </span>
                        {getStatusBadge(case_.status)}
                        {getPriorityBadge(case_.priority)}
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {case_.title}
                      </h3>
                      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                        <p>
                          Claimant: <span className="font-mono">{case_.claimant}</span>
                        </p>
                        <p>
                          Respondent: <span className="font-mono">{case_.respondent}</span>
                        </p>
                      </div>
                    </div>

                    {/* Panel & Amount */}
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Panel</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {case_.panelMembers.length} members
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Disputed Amount</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {case_.amount} ETH
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Deadline</p>
                        <p className={`text-sm font-medium ${
                          case_.deadline < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
                            ? 'text-red-600'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {formatRelativeTime(case_.deadline)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={`/${locale}/dashboard/majelis/case/${case_.id}`}>
                          <Button size="sm" leftIcon={<Eye className="w-4 h-4" />}>
                            Review
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" className="w-9 h-9 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Decisions & Calendar */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Decisions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-amantra-green-600" />
                {t('majelis.recentDecisions.title')}
              </CardTitle>
              <CardDescription>{t('majelis.recentDecisions.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentDecisions.map((decision) => (
                  <div
                    key={decision.id}
                    className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
                        {decision.id}
                      </span>
                      <span className="text-sm text-gray-400">
                        {formatRelativeTime(decision.resolvedAt)}
                      </span>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      {decision.title}
                    </h4>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          decision.decision === 'favor_claimant' ? 'success' :
                          decision.decision === 'favor_respondent' ? 'warning' :
                          'info'
                        }>
                          {decision.decision === 'favor_claimant' ? 'Favor Claimant' :
                           decision.decision === 'favor_respondent' ? 'Favor Respondent' :
                           'Split 50/50'}
                        </Badge>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Your vote: {decision.yourVote === decision.decision ? '✓ Aligned' : '✗ Different'}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {decision.amount} ETH
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Arbitrator Guidelines */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-amantra-gold-600" />
                {t('majelis.guidelines.title')}
              </CardTitle>
              <CardDescription>{t('majelis.guidelines.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-amantra-green-50 dark:bg-amantra-green-900/20 border border-amantra-green-200 dark:border-amantra-green-800">
                  <h4 className="font-semibold text-amantra-green-800 dark:text-amantra-green-300 mb-2">
                    {'Adl (Justice)}
                  </h4>
                  <p className="text-sm text-amantra-green-700 dark:text-amantra-green-400">
                    Ensure fair and impartial review of all evidence from both parties before making a decision.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                    Evidence Standards
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Verify document hashes match on-chain records. Consider timeline and delivery confirmations.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">
                    Decision Timeline
                  </h4>
                  <p className="text-sm text-purple-700 dark:text-purple-400">
                    All decisions must be made within 7 days. 2/3 majority vote required for binding resolution.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-amantra-gold-50 dark:bg-amantra-gold-900/20 border border-amantra-gold-200 dark:border-amantra-gold-800">
                  <h4 className="font-semibold text-amantra-gold-800 dark:text-amantra-gold-300 mb-2">
                    Rahmah (Mercy)
                  </h4>
                  <p className="text-sm text-amantra-gold-700 dark:text-amantra-gold-400">
                    Where possible, encourage mediation and reconciliation before formal resolution.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
