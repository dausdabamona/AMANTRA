'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Shield,
  Target,
  Eye,
  Heart,
  Users,
  Scale,
  Landmark,
  Globe,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export default function AboutPage() {
  const t = useTranslations();

  const values = [
    {
      icon: Shield,
      title: 'Amanah (Trust)',
      description: 'Every transaction is safeguarded with bank-grade security and transparent processes.',
      color: 'text-amantra-green-600',
      bgColor: 'bg-amantra-green-50 dark:bg-amantra-green-900/20',
    },
    {
      icon: Scale,
      title: "'Adl (Justice)",
      description: 'Fair and impartial dispute resolution through qualified arbitration council.',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: Eye,
      title: 'Hisbah (Oversight)',
      description: 'Continuous monitoring and compliance verification by independent oversight body.',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      icon: Users,
      title: 'Shura (Consultation)',
      description: 'Collective decision-making through multi-signature governance model.',
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    },
    {
      icon: Heart,
      title: 'Rahmah (Mercy)',
      description: 'Compassionate approach to dispute resolution with focus on reconciliation.',
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      icon: Award,
      title: "Mas'uliyyah (Accountability)",
      description: 'Full accountability with complete audit trail and transparent operations.',
      color: 'text-amantra-gold-600',
      bgColor: 'bg-amantra-gold-50 dark:bg-amantra-gold-900/20',
    },
  ];

  const milestones = [
    {
      year: '2024',
      title: 'Foundation',
      description: 'AMANTRA concept developed with focus on Sharia-compliant digital transactions.',
    },
    {
      year: '2024',
      title: 'V1 Launch',
      description: 'Initial platform release with basic escrow and contract management.',
    },
    {
      year: '2024',
      title: 'V3 Integration',
      description: 'Majelis Arbitrase Digital integration for comprehensive dispute resolution.',
    },
    {
      year: '2025',
      title: 'V5 Zero SPOF',
      description: 'Complete overhaul with multi-layer multisig and zero single point of failure.',
    },
  ];

  const stats = [
    { value: '100%', label: 'Sharia Compliant' },
    { value: '5', label: 'Layer Multisig' },
    { value: '24/7', label: 'System Uptime' },
    { value: '0', label: 'Single Points of Failure' },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-24 bg-gradient-to-br from-white via-amantra-green-50/30 to-amantra-gold-50/20 dark:from-gray-950 dark:via-amantra-green-950/30 dark:to-amantra-gold-950/20">
        <div className="absolute inset-0 islamic-pattern opacity-20" />

        <div className="container relative mx-auto px-4">
          <motion.div
            initial="initial"
            animate="animate"
            variants={fadeInUp}
            className="max-w-3xl mx-auto text-center"
          >
            <Badge variant="gold" className="mb-6">
              {t('about.badge')}
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              {t('about.title')}
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
              {t('about.subtitle')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-gradient-to-br from-amantra-green-50 to-white dark:from-amantra-green-900/20 dark:to-gray-900">
                <CardContent className="p-8">
                  <div className="w-14 h-14 rounded-xl bg-amantra-green-100 dark:bg-amantra-green-800/50 flex items-center justify-center mb-6">
                    <Target className="w-7 h-7 text-amantra-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    {t('about.mission.title')}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    {t('about.mission.description')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-gradient-to-br from-amantra-gold-50 to-white dark:from-amantra-gold-900/20 dark:to-gray-900">
                <CardContent className="p-8">
                  <div className="w-14 h-14 rounded-xl bg-amantra-gold-100 dark:bg-amantra-gold-800/50 flex items-center justify-center mb-6">
                    <Eye className="w-7 h-7 text-amantra-gold-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    {t('about.vision.title')}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    {t('about.vision.description')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold text-amantra-green-600 mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              {t('about.values.badge')}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('about.values.title')}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('about.values.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl ${value.bgColor} flex items-center justify-center mb-4`}>
                      <value.icon className={`w-6 h-6 ${value.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {value.title}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              {t('about.journey.badge')}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('about.journey.title')}
            </h2>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            {milestones.map((milestone, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative pl-8 pb-12 last:pb-0"
              >
                {/* Timeline Line */}
                {index < milestones.length - 1 && (
                  <div className="absolute left-[11px] top-6 w-0.5 h-full bg-gray-200 dark:bg-gray-700" />
                )}

                {/* Timeline Dot */}
                <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-amantra-green-500 border-4 border-white dark:border-gray-900 shadow" />

                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="outline">{milestone.year}</Badge>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {milestone.title}
                    </h3>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {milestone.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              {t('about.architecture.badge')}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('about.architecture.title')}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('about.architecture.subtitle')}
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <Card className="overflow-hidden">
              <CardContent className="p-8">
                <div className="grid md:grid-cols-3 gap-8">
                  {/* Web2 Layer */}
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                      <Globe className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Web2 Layer
                    </h3>
                    <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Traditional Banking API
                      </li>
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        User Authentication
                      </li>
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Document Storage
                      </li>
                    </ul>
                  </div>

                  {/* Web3 Layer */}
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
                      <Landmark className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Web3 Layer
                    </h3>
                    <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Smart Contracts
                      </li>
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Multi-sig Wallets
                      </li>
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        On-chain Evidence
                      </li>
                    </ul>
                  </div>

                  {/* Arbitration Layer */}
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amantra-gold-100 dark:bg-amantra-gold-900/30 flex items-center justify-center mx-auto mb-4">
                      <Scale className="w-8 h-8 text-amantra-gold-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      Arbitration Layer
                    </h3>
                    <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Majelis Council
                      </li>
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Hisbah Oversight
                      </li>
                      <li className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-amantra-green-500" />
                        Appeal System
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
