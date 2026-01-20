'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  FileText,
  Lock,
  Send,
  CheckCircle,
  AlertTriangle,
  Scale,
  Gavel,
  Banknote,
  ExternalLink,
  Clock,
  Shield,
  Users,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatAddress, formatRelativeTime, cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  type: 'contract_created' | 'funded' | 'delivery_confirmed' | 'dispute_raised' | 'evidence_submitted' | 'arbitration_started' | 'decision_made' | 'settlement' | 'completed' | 'heartbeat';
  timestamp: Date;
  actor: string;
  txHash?: string;
  data?: {
    amount?: string;
    evidenceHash?: string;
    decision?: string;
    description?: string;
  };
}

interface TimelineViewerProps {
  contractId: string;
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

const eventConfig = {
  contract_created: {
    icon: FileText,
    color: 'bg-blue-500',
    label: 'Contract Created',
  },
  funded: {
    icon: Lock,
    color: 'bg-amantra-green-500',
    label: 'Escrow Funded',
  },
  delivery_confirmed: {
    icon: Send,
    color: 'bg-purple-500',
    label: 'Delivery Confirmed',
  },
  dispute_raised: {
    icon: AlertTriangle,
    color: 'bg-red-500',
    label: 'Dispute Raised',
  },
  evidence_submitted: {
    icon: Eye,
    color: 'bg-blue-400',
    label: 'Evidence Submitted',
  },
  arbitration_started: {
    icon: Scale,
    color: 'bg-amantra-gold-500',
    label: 'Arbitration Started',
  },
  decision_made: {
    icon: Gavel,
    color: 'bg-purple-600',
    label: 'Decision Made',
  },
  settlement: {
    icon: Banknote,
    color: 'bg-amantra-green-600',
    label: 'Settlement Executed',
  },
  completed: {
    icon: CheckCircle,
    color: 'bg-amantra-green-500',
    label: 'Contract Completed',
  },
  heartbeat: {
    icon: Shield,
    color: 'bg-gray-400',
    label: 'Heartbeat Signal',
  },
};

export function TimelineViewer({ contractId, events, onEventClick }: TimelineViewerProps) {
  const t = useTranslations();
  const [expandedEvent, setExpandedEvent] = React.useState<string | null>(null);

  const sortedEvents = [...events].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const getExplorerUrl = (txHash: string, chainId: number = 1) => {
    const explorers: Record<number, string> = {
      1: 'https://etherscan.io/tx/',
      5: 'https://goerli.etherscan.io/tx/',
      11155111: 'https://sepolia.etherscan.io/tx/',
      137: 'https://polygonscan.com/tx/',
      80001: 'https://mumbai.polygonscan.com/tx/',
    };
    return `${explorers[chainId] || explorers[1]}${txHash}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amantra-green-600" />
          {t('timeline.title')}
        </CardTitle>
        <CardDescription>
          {t('timeline.description')} - {formatAddress(contractId)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

          {/* Events */}
          <div className="space-y-6">
            {sortedEvents.map((event, index) => {
              const config = eventConfig[event.type];
              const Icon = config.icon;
              const isExpanded = expandedEvent === event.id;

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative flex gap-4"
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
                      config.color
                    )}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <div
                      className={cn(
                        'p-4 rounded-lg border transition-all cursor-pointer',
                        isExpanded
                          ? 'border-amantra-green-300 dark:border-amantra-green-700 bg-amantra-green-50/50 dark:bg-amantra-green-900/10'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700'
                      )}
                      onClick={() => {
                        setExpandedEvent(isExpanded ? null : event.id);
                        onEventClick?.(event);
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{config.label}</Badge>
                          {event.type === 'dispute_raised' && (
                            <Badge variant="error">Dispute</Badge>
                          )}
                          {event.type === 'completed' && (
                            <Badge variant="success">Complete</Badge>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>

                      {/* Actor */}
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                        <span className="text-gray-400">By:</span>{' '}
                        <span className="font-mono">{formatAddress(event.actor)}</span>
                      </p>

                      {/* Additional Data */}
                      {event.data?.amount && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="text-gray-400">Amount:</span>{' '}
                          <span className="font-semibold">{event.data.amount} ETH</span>
                        </p>
                      )}

                      {event.data?.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {event.data.description}
                        </p>
                      )}

                      {/* Expanded Details */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                        >
                          <div className="space-y-3 text-sm">
                            <div>
                              <span className="text-gray-400">Timestamp:</span>{' '}
                              <span className="text-gray-600 dark:text-gray-300">
                                {event.timestamp.toLocaleString()}
                              </span>
                            </div>

                            {event.txHash && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">Transaction:</span>
                                <a
                                  href={getExplorerUrl(event.txHash)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-amantra-green-600 hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {formatAddress(event.txHash)}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}

                            {event.data?.evidenceHash && (
                              <div>
                                <span className="text-gray-400">Evidence Hash:</span>
                                <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs break-all">
                                  {event.data.evidenceHash}
                                </div>
                              </div>
                            )}

                            {event.data?.decision && (
                              <div>
                                <span className="text-gray-400">Decision:</span>{' '}
                                <Badge
                                  variant={
                                    event.data.decision.includes('claimant')
                                      ? 'success'
                                      : event.data.decision.includes('respondent')
                                      ? 'warning'
                                      : 'info'
                                  }
                                >
                                  {event.data.decision}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Current Status Indicator */}
          {sortedEvents.length > 0 && (
            <div className="relative flex gap-4 mt-2">
              <div className="w-12 flex justify-center">
                <div className="w-3 h-3 rounded-full bg-amantra-green-500 animate-pulse" />
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('timeline.currentStatus')}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Heartbeat Monitor Component
interface HeartbeatMonitorProps {
  signers: {
    address: string;
    role: string;
    lastHeartbeat: Date | null;
  }[];
  threshold: number; // in days
}

export function HeartbeatMonitor({ signers, threshold }: HeartbeatMonitorProps) {
  const t = useTranslations();

  const getHeartbeatStatus = (lastHeartbeat: Date | null) => {
    if (!lastHeartbeat) return 'unknown';
    const daysSinceHeartbeat = (Date.now() - lastHeartbeat.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceHeartbeat <= threshold * 0.5) return 'healthy';
    if (daysSinceHeartbeat <= threshold * 0.75) return 'warning';
    if (daysSinceHeartbeat <= threshold) return 'critical';
    return 'expired';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-amantra-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-red-500';
      case 'expired':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-600" />
          {t('heartbeat.title')}
        </CardTitle>
        <CardDescription>
          {t('heartbeat.description')} ({threshold} {t('heartbeat.dayThreshold')})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {signers.map((signer, index) => {
            const status = getHeartbeatStatus(signer.lastHeartbeat);
            return (
              <div
                key={index}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-3 h-3 rounded-full', getStatusColor(status))} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {signer.role}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {formatAddress(signer.address)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    variant={
                      status === 'healthy'
                        ? 'success'
                        : status === 'warning'
                        ? 'warning'
                        : status === 'critical' || status === 'expired'
                        ? 'error'
                        : 'secondary'
                    }
                  >
                    {status}
                  </Badge>
                  {signer.lastHeartbeat && (
                    <p className="text-xs text-gray-400 mt-1">
                      {formatRelativeTime(signer.lastHeartbeat)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
