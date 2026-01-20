'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  FileText,
  Send,
  Lock,
  CheckCircle,
  AlertTriangle,
  Scale,
  Shield,
  ArrowRight,
  Users,
  Clock,
  Eye,
  Gavel,
  Banknote,
  FileCheck,
  ArrowDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface HowItWorksPageProps {
  params: { locale: string };
}

export default function HowItWorksPage({ params }: HowItWorksPageProps) {
  const { locale } = params;
  const t = useTranslations();

  const mainSteps = [
    {
      number: 1,
      icon: FileText,
      title: t('howItWorks.step1.title'),
      description: t('howItWorks.step1.description'),
      details: [
        'Define contract terms and conditions',
        'Set payment milestones',
        'Upload supporting documents',
        'Specify delivery requirements',
      ],
      color: 'from-amantra-green-500 to-amantra-green-600',
    },
    {
      number: 2,
      icon: Lock,
      title: t('howItWorks.step2.title'),
      description: t('howItWorks.step2.description'),
      details: [
        'Buyer deposits funds to escrow',
        'Multi-signature wallet secures funds',
        'Both parties notified',
        'Contract becomes active',
      ],
      color: 'from-blue-500 to-blue-600',
    },
    {
      number: 3,
      icon: Send,
      title: t('howItWorks.step3.title'),
      description: t('howItWorks.step3.description'),
      details: [
        'Seller delivers goods/services',
        'Evidence uploaded to blockchain',
        'Hash verification for integrity',
        'Timeline tracked on-chain',
      ],
      color: 'from-purple-500 to-purple-600',
    },
    {
      number: 4,
      icon: CheckCircle,
      title: t('howItWorks.step4.title'),
      description: t('howItWorks.step4.description'),
      details: [
        'Buyer confirms delivery',
        'Automatic fund release',
        'Transaction recorded on-chain',
        'Contract marked complete',
      ],
      color: 'from-amantra-gold-500 to-amantra-gold-600',
    },
  ];

  const disputeFlow = [
    {
      step: 1,
      icon: AlertTriangle,
      title: 'Dispute Raised',
      description: 'Either party can raise a dispute with supporting evidence.',
    },
    {
      step: 2,
      icon: Eye,
      title: 'Hisbah Review',
      description: 'Oversight body performs initial review and verification.',
    },
    {
      step: 3,
      icon: Users,
      title: 'Majelis Assignment',
      description: '3-member arbitration panel assigned to the case.',
    },
    {
      step: 4,
      icon: Scale,
      title: 'Evidence Review',
      description: 'Arbitrators review all evidence from both parties.',
    },
    {
      step: 5,
      icon: Gavel,
      title: 'Decision',
      description: 'Binding decision made by 2/3 majority vote.',
    },
    {
      step: 6,
      icon: Banknote,
      title: 'Settlement',
      description: 'Funds distributed according to arbitration decision.',
    },
  ];

  const roles = [
    {
      title: 'Buyer',
      icon: Users,
      responsibilities: [
        'Create contracts',
        'Deposit funds',
        'Confirm delivery',
        'Raise disputes if needed',
      ],
      color: 'bg-blue-500',
    },
    {
      title: 'Seller',
      icon: Send,
      responsibilities: [
        'Accept contracts',
        'Deliver goods/services',
        'Submit evidence',
        'Respond to disputes',
      ],
      color: 'bg-purple-500',
    },
    {
      title: 'Majelis',
      icon: Scale,
      responsibilities: [
        'Review disputes',
        'Examine evidence',
        'Make binding decisions',
        'Ensure Sharia compliance',
      ],
      color: 'bg-amantra-gold-500',
    },
    {
      title: 'Hisbah',
      icon: Eye,
      responsibilities: [
        'Monitor transactions',
        'Verify compliance',
        'Flag suspicious activity',
        'Audit decisions',
      ],
      color: 'bg-amantra-green-500',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-24 bg-gradient-to-br from-white via-amantra-green-50/30 to-amantra-gold-50/20 dark:from-gray-950 dark:via-amantra-green-950/30 dark:to-amantra-gold-950/20">
        <div className="absolute inset-0 islamic-pattern opacity-20" />

        <div className="container relative mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center"
          >
            <Badge variant="gold" className="mb-6">
              {t('howItWorks.badge')}
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              {t('howItWorks.title')}
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-300">
              {t('howItWorks.subtitle')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Flow */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              Transaction Flow
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Normal Transaction Process
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              When everything goes smoothly, this is how a typical transaction flows through AMANTRA.
            </p>
          </motion.div>

          <div className="max-w-5xl mx-auto">
            {mainSteps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="mb-8 last:mb-0"
              >
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  {/* Step Number */}
                  <div className="flex-shrink-0">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} text-white text-2xl font-bold flex items-center justify-center shadow-lg`}>
                      {step.number}
                    </div>
                  </div>

                  {/* Content */}
                  <Card className="flex-1">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <step.icon className="w-5 h-5 text-gray-400" />
                        <CardTitle className="text-xl">{step.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 dark:text-gray-300 mb-4">
                        {step.description}
                      </p>
                      <ul className="grid sm:grid-cols-2 gap-2">
                        {step.details.map((detail, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <CheckCircle className="w-4 h-4 text-amantra-green-500 flex-shrink-0" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                {/* Connector */}
                {index < mainSteps.length - 1 && (
                  <div className="flex justify-center md:justify-start md:ml-8 py-4">
                    <ArrowDown className="w-6 h-6 text-gray-300 dark:text-gray-700" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Dispute Resolution */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              Dispute Resolution
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              What If There's a Dispute?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Our Sharia-compliant arbitration process ensures fair and just resolution.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {disputeFlow.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="h-full relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-amantra-gold-100 dark:bg-amantra-gold-900/30 rounded-bl-3xl flex items-center justify-center">
                      <span className="text-amantra-gold-600 font-bold">{item.step}</span>
                    </div>
                    <CardContent className="pt-8 pb-6 px-6">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                        <item.icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                        {item.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              Ecosystem Roles
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Who's Involved?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              Each role in the AMANTRA ecosystem has specific responsibilities to ensure trust and fairness.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {roles.map((role, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full">
                  <CardContent className="pt-6">
                    <div className={`w-12 h-12 rounded-xl ${role.color} flex items-center justify-center mb-4`}>
                      <role.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      {role.title}
                    </h3>
                    <ul className="space-y-2">
                      {role.responsibilities.map((resp, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-amantra-green-500" />
                          {resp}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="gold" className="mb-4">
              Security
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Zero Single Point of Failure
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              AMANTRA is built on the principle that no single person, key, server, or institution can bring down the system.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-8">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-amantra-green-600" />
                      Multi-Layer Multisig
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>5-layer governance structure with different authority levels</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Operations require 3 of 5 signatures</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Emergency recovery with 4 of 5 consensus</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amantra-gold-600" />
                      Dead Man's Switch
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Automatic succession if signers become inactive</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Heartbeat monitoring with configurable thresholds</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Peaceful power transfer protocol</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-blue-600" />
                      On-Chain Evidence
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>All evidence hashed and stored on blockchain</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Immutable timeline of all actions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Verifiable hash for document integrity</span>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Banknote className="w-5 h-5 text-purple-600" />
                      Bank Integration
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Traditional bank account as additional custody layer</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Anti-hostage fund release mechanism</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Regulatory compliance support</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amantra-green-600 to-amantra-green-700 p-12 text-center"
          >
            <div className="absolute inset-0 islamic-pattern opacity-10" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Get Started?
              </h2>
              <p className="text-lg text-amantra-green-100 mb-8 max-w-2xl mx-auto">
                Experience secure, Sharia-compliant digital transactions today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href={`/${locale}/dashboard`}>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="bg-white text-amantra-green-700 hover:bg-gray-100"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Launch Dashboard
                  </Button>
                </Link>
                <Link href={`/${locale}/sharia-principles`}>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-white text-white hover:bg-white/10"
                  >
                    Learn Sharia Principles
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
