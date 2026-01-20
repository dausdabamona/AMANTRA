'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Shield,
  Scale,
  Eye,
  Users,
  Heart,
  Award,
  BookOpen,
  FileText,
  Ban,
  CheckCircle,
  AlertCircle,
  Scroll,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ShariaPrinciplesPage() {
  const t = useTranslations();

  const principles = [
    {
      icon: Shield,
      arabic: 'الأمانة',
      title: 'Amanah (Trust)',
      description: 'Trustworthiness is the foundation of all transactions. Every party must fulfill their obligations with integrity and honesty.',
      implementation: [
        'Multi-signature wallets prevent unilateral access to funds',
        'Complete audit trail for all transactions',
        'Transparent fee structure with no hidden charges',
        'Secure document storage with hash verification',
      ],
      color: 'text-amantra-green-600',
      bgColor: 'bg-amantra-green-50 dark:bg-amantra-green-900/20',
    },
    {
      icon: Scale,
      arabic: 'العدل',
      title: "'Adl (Justice)",
      description: 'Fair and equitable treatment for all parties. No one should be wronged, and disputes must be resolved justly.',
      implementation: [
        'Independent arbitration council (Majelis)',
        'Equal opportunity for both parties to present evidence',
        'Binding decisions based on merit, not influence',
        'Appeal process for complex cases',
      ],
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: Eye,
      arabic: 'الحسبة',
      title: 'Hisbah (Oversight)',
      description: 'Continuous monitoring to prevent wrongdoing and ensure compliance with Islamic principles.',
      implementation: [
        'Independent Hisbah oversight body',
        'Real-time transaction monitoring',
        'Compliance verification for all operations',
        'Proactive fraud detection',
      ],
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      icon: Users,
      arabic: 'الشورى',
      title: 'Shura (Consultation)',
      description: 'Collective decision-making through consultation. No single entity should have absolute power.',
      implementation: [
        '5-layer multisig governance',
        'Minimum 3 of 5 signatures for operations',
        'Community governance proposals',
        'Transparent voting process',
      ],
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    },
    {
      icon: Award,
      arabic: 'المسؤولية',
      title: "Mas'uliyyah (Accountability)",
      description: 'Every action must be accounted for. Those in positions of authority are responsible for their decisions.',
      implementation: [
        'On-chain record of all decisions',
        'Arbitrator performance tracking',
        'Public dispute resolution outcomes',
        'Regular governance reports',
      ],
      color: 'text-amantra-gold-600',
      bgColor: 'bg-amantra-gold-50 dark:bg-amantra-gold-900/20',
    },
    {
      icon: Heart,
      arabic: 'الرحمة',
      title: 'Rahmah (Mercy)',
      description: 'Compassion in all dealings. Even in disputes, the goal is reconciliation and mutual benefit.',
      implementation: [
        'Mediation encouraged before formal arbitration',
        'Flexible settlement options',
        'Payment plan accommodations',
        'Graceful dispute resolution',
      ],
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
  ];

  const prohibitions = [
    {
      title: 'Riba (Interest)',
      description: 'No interest-based transactions. All returns must be tied to real economic activity.',
      icon: Ban,
    },
    {
      title: 'Gharar (Excessive Uncertainty)',
      description: 'All contract terms must be clear and specific. No ambiguous or deceptive conditions.',
      icon: AlertCircle,
    },
    {
      title: 'Zulm (Oppression)',
      description: 'No exploitation or unfair advantage. Both parties must benefit equitably.',
      icon: Ban,
    },
    {
      title: 'Maysir (Gambling)',
      description: 'No speculative contracts where outcome depends purely on chance.',
      icon: AlertCircle,
    },
  ];

  const akadTypes = [
    {
      name: 'Bay (Sale)',
      description: 'Direct sale of goods or services with clear terms and pricing.',
      suitable: ['Product purchases', 'Service agreements', 'Digital goods'],
    },
    {
      name: "Ijarah (Lease/Service)",
      description: 'Rental or service agreement where usage rights are transferred temporarily.',
      suitable: ['Equipment rental', 'Professional services', 'Subscriptions'],
    },
    {
      name: 'Istisna (Manufacturing)',
      description: 'Contract for manufacturing or construction with specified requirements.',
      suitable: ['Custom products', 'Software development', 'Construction'],
    },
    {
      name: 'Murabaha (Cost-Plus)',
      description: 'Sale where the cost and profit margin are disclosed to the buyer.',
      suitable: ['Trade financing', 'Asset acquisition', 'Inventory purchase'],
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
              <Scroll className="w-3 h-3 mr-1" />
              {t('sharia.badge')}
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              {t('sharia.title')}
            </h1>

            <p className="text-lg text-gray-600 dark:text-gray-300">
              {t('sharia.subtitle')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Core Principles */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              Core Principles
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Foundations of Islamic Finance
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              These principles guide every aspect of AMANTRA's design and operation.
            </p>
          </motion.div>

          <div className="space-y-8">
            {principles.map((principle, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="overflow-hidden">
                  <div className="grid lg:grid-cols-3 gap-0">
                    {/* Principle Info */}
                    <div className={`p-8 ${principle.bgColor}`}>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center">
                          <principle.icon className={`w-7 h-7 ${principle.color}`} />
                        </div>
                        <div>
                          <p className="text-2xl font-arabic text-gray-400 dark:text-gray-500">
                            {principle.arabic}
                          </p>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            {principle.title}
                          </h3>
                        </div>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        {principle.description}
                      </p>
                    </div>

                    {/* Implementation */}
                    <div className="lg:col-span-2 p-8 bg-white dark:bg-gray-800/50">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amantra-green-600" />
                        How We Implement This
                      </h4>
                      <ul className="grid sm:grid-cols-2 gap-3">
                        {principle.implementation.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Prohibitions */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="error" className="mb-4">
              Prohibitions
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              What We Avoid
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              AMANTRA is designed to avoid these prohibited elements in Islamic finance.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {prohibitions.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full border-red-100 dark:border-red-900/30">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                      <item.icon className="w-6 h-6 text-red-600 dark:text-red-400" />
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
      </section>

      {/* Contract Types */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              <FileText className="w-3 h-3 mr-1" />
              Contract Types
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Supported Akad Types
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              AMANTRA supports various Sharia-compliant contract structures.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {akadTypes.map((akad, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amantra-green-100 dark:bg-amantra-green-900/30 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-amantra-green-600" />
                      </div>
                      {akad.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      {akad.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {akad.suitable.map((use, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {use}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Card className="overflow-hidden">
                <div className="grid md:grid-cols-2">
                  <div className="p-8 bg-gradient-to-br from-amantra-green-500 to-amantra-green-600 text-white">
                    <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center mb-6">
                      <Award className="w-7 h-7" />
                    </div>
                    <h2 className="text-2xl font-bold mb-4">
                      Sharia Compliance Verification
                    </h2>
                    <p className="text-amantra-green-100">
                      Our platform undergoes regular review by qualified Sharia scholars to ensure ongoing compliance with Islamic principles.
                    </p>
                  </div>

                  <div className="p-8 bg-white dark:bg-gray-800">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                      Compliance Measures
                    </h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Regular Sharia board review of platform operations</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Contract templates reviewed for Sharia compliance</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Arbitrators trained in Islamic jurisprudence</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Transparent fee structure without hidden interest</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-amantra-green-500 mt-0.5 flex-shrink-0" />
                        <span>Public audit reports available for review</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}
