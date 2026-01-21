'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  FileText,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  MoreVertical,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatAddress, formatRelativeTime, getStatusLabel, getStatusColor } from '@/lib/utils';
import { ContractStatus } from '@/types';

interface ContractsPageProps {
  params: { locale: string };
}

export default function ContractsPage({ params }: ContractsPageProps) {
  const { locale } = params;
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<ContractStatus | 'all'>('all');
  const [roleFilter, setRoleFilter] = React.useState<'all' | 'buyer' | 'seller'>('all');

  // Mock data
  const contracts = [
    {
      id: '0x1234567890abcdef1234567890abcdef12345678',
      title: 'Website Development Project',
      description: 'Full-stack web application development with React and Node.js',
      counterparty: '0xabcdef1234567890abcdef1234567890abcdef12',
      amount: '2.5',
      status: ContractStatus.FUNDED,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      role: 'buyer' as const,
      akadType: 'Istisna',
    },
    {
      id: '0x2345678901bcdef12345678901bcdef123456789',
      title: 'Logo Design Services',
      description: 'Professional logo design with unlimited revisions',
      counterparty: '0xbcdef12345678901bcdef12345678901bcdef123',
      amount: '0.8',
      status: ContractStatus.VERIFIED,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      role: 'seller' as const,
      akadType: 'Ijarah',
    },
    {
      id: '0x3456789012cdef123456789012cdef1234567890',
      title: 'Consulting Agreement',
      description: 'Business strategy consulting for 3 months',
      counterparty: '0xcdef123456789012cdef123456789012cdef1234',
      amount: '1.2',
      status: ContractStatus.DISPUTED,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      role: 'buyer' as const,
      akadType: 'Ijarah',
    },
    {
      id: '0x4567890123def1234567890123def12345678901',
      title: 'Digital Marketing Campaign',
      description: 'Social media marketing for product launch',
      counterparty: '0xdef1234567890123def1234567890123def12345',
      amount: '1.5',
      status: ContractStatus.SETTLED,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      role: 'seller' as const,
      akadType: 'Ijarah',
    },
    {
      id: '0x5678901234ef12345678901234ef123456789012',
      title: 'Mobile App Development',
      description: 'Cross-platform mobile application',
      counterparty: '0xef12345678901234ef12345678901234ef123456',
      amount: '5.0',
      status: ContractStatus.CREATED,
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      role: 'buyer' as const,
      akadType: 'Istisna',
    },
  ];

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
    const matchesRole = roleFilter === 'all' || contract.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const statusCounts = {
    all: contracts.length,
    [ContractStatus.CREATED]: contracts.filter((c) => c.status === ContractStatus.CREATED).length,
    [ContractStatus.FUNDED]: contracts.filter((c) => c.status === ContractStatus.FUNDED).length,
    [ContractStatus.VERIFIED]: contracts.filter((c) => c.status === ContractStatus.VERIFIED).length,
    [ContractStatus.DISPUTED]: contracts.filter((c) => c.status === ContractStatus.DISPUTED).length,
    [ContractStatus.SETTLED]: contracts.filter((c) => c.status === ContractStatus.SETTLED).length,
    [ContractStatus.CANCELLED]: contracts.filter((c) => c.status === ContractStatus.CANCELLED).length,
  };

  const getStatusIcon = (status: ContractStatus) => {
    switch (status) {
      case ContractStatus.CREATED:
        return <FileText className="w-4 h-4" />;
      case ContractStatus.FUNDED:
        return <Clock className="w-4 h-4" />;
      case ContractStatus.VERIFIED:
        return <CheckCircle className="w-4 h-4" />;
      case ContractStatus.SETTLED:
        return <CheckCircle className="w-4 h-4" />;
      case ContractStatus.DISPUTED:
        return <AlertTriangle className="w-4 h-4" />;
      case ContractStatus.CANCELLED:
        return <XCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('contracts.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('contracts.subtitle')}
          </p>
        </div>
        <Link href={`/${locale}/dashboard/contracts/new`}>
          <Button leftIcon={<Plus className="w-4 h-4" />}>
            {t('contracts.createNew')}
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder={t('contracts.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                {t('contracts.filter.all')} ({statusCounts.all})
              </Button>
              <Button
                variant={statusFilter === ContractStatus.FUNDED ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(ContractStatus.FUNDED)}
              >
                {t('status.funded')} ({statusCounts[ContractStatus.FUNDED]})
              </Button>
              <Button
                variant={statusFilter === ContractStatus.VERIFIED ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(ContractStatus.VERIFIED)}
              >
                {t('status.verified')} ({statusCounts[ContractStatus.VERIFIED]})
              </Button>
              <Button
                variant={statusFilter === ContractStatus.DISPUTED ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(ContractStatus.DISPUTED)}
                className={statusFilter === ContractStatus.DISPUTED ? '' : 'text-red-600 border-red-200 hover:bg-red-50'}
              >
                {t('status.disputed')} ({statusCounts[ContractStatus.DISPUTED]})
              </Button>
            </div>

            {/* Role Filter */}
            <div className="flex gap-2">
              <Button
                variant={roleFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setRoleFilter('all')}
              >
                {t('contracts.filter.allRoles')}
              </Button>
              <Button
                variant={roleFilter === 'buyer' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setRoleFilter('buyer')}
              >
                {t('contracts.filter.asBuyer')}
              </Button>
              <Button
                variant={roleFilter === 'seller' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setRoleFilter('seller')}
              >
                {t('contracts.filter.asSeller')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contracts List */}
      <div className="space-y-4">
        {filteredContracts.length > 0 ? (
          filteredContracts.map((contract, index) => (
            <motion.div
              key={contract.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Contract Info */}
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        contract.status === ContractStatus.DISPUTED
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : contract.status === ContractStatus.SETTLED
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        {getStatusIcon(contract.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {contract.title}
                          </h3>
                          <Badge variant={getStatusColor(contract.status) as any}>
                            {getStatusLabel(contract.status)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {contract.akadType}
                          </Badge>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                          {contract.description}
                        </p>

                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                          <span>
                            {contract.role === 'buyer' ? 'To' : 'From'}: {formatAddress(contract.counterparty)}
                          </span>
                          <span>•</span>
                          <span>{formatRelativeTime(contract.createdAt)}</span>
                          <span>•</span>
                          <span>ID: {formatAddress(contract.id)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex items-center gap-6 pl-16 lg:pl-0">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {contract.amount}
                          <span className="text-sm ml-1 text-gray-500">ETH</span>
                        </p>
                        <Badge variant={contract.role === 'buyer' ? 'info' : 'gold'} className="text-xs mt-1">
                          {contract.role === 'buyer' ? t('contracts.asBuyer') : t('contracts.asSeller')}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={`/${locale}/dashboard/contracts/${contract.id}`}>
                          <Button variant="outline" size="sm" leftIcon={<Eye className="w-4 h-4" />}>
                            {t('common.view')}
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" className="w-9 h-9 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Progress/Deadline */}
                  {(contract.status === ContractStatus.FUNDED || contract.status === ContractStatus.VERIFIED) && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">
                          {t('contracts.deadline')}: {contract.deadline.toLocaleDateString()}
                        </span>
                        {contract.deadline > new Date() ? (
                          <span className="text-amantra-green-600">
                            {Math.ceil((contract.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} {t('contracts.daysRemaining')}
                          </span>
                        ) : (
                          <span className="text-red-600">
                            {t('contracts.overdue')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('contracts.empty.title')}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                {t('contracts.empty.description')}
              </p>
              <Link href={`/${locale}/dashboard/contracts/new`}>
                <Button leftIcon={<Plus className="w-4 h-4" />}>
                  {t('contracts.createNew')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
