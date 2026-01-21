'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Shield,
  FileText,
  Scale,
  Users,
  Lock,
  Eye,
  ArrowRight,
  CheckCircle2,
  Zap,
  Globe,
  Building2,
  Landmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HomePageProps {
  params: { locale: string };
}

// Animation variants - start visible for SSR, animate on client
const fadeInUp = {
  initial: { opacity: 1, y: 0 }, // Start visible for static HTML
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function HomePage({ params }: HomePageProps) {
  const { locale } = params;
  const t = useTranslations();

  const features = [
    {
      icon: FileText,
      title: t('features.digitalContract.title'),
      description: t('features.digitalContract.description'),
      color: 'text-amantra-green-600',
      bgColor: 'bg-amantra-green-50 dark:bg-amantra-green-900/20',
    },
    {
      icon: Lock,
      title: t('features.escrow.title'),
      description: t('features.escrow.description'),
      color: 'text-amantra-gold-600',
      bgColor: 'bg-amantra-gold-50 dark:bg-amantra-gold-900/20',
    },
    {
      icon: Scale,
      title: t('features.arbitration.title'),
      description: t('features.arbitration.description'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      icon: Eye,
      title: t('features.hisbah.title'),
      description: t('features.hisbah.description'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      icon: Users,
      title: t('features.governance.title'),
      description: t('features.governance.description'),
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    },
    {
      icon: Shield,
      title: t('features.zeroSPOF.title'),
      description: t('features.zeroSPOF.description'),
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
  ];

  const principles = [
    { key: 'amanah', icon: Shield },
    { key: 'adl', icon: Scale },
    { key: 'hisbah', icon: Eye },
    { key: 'shura', icon: Users },
  ];

  const stats = [
    { value: '100%', label: t('stats.shariaCompliant') },
    { value: '3/5', label: t('stats.multisigRequired') },
    { value: '24/7', label: t('stats.systemAvailability') },
    { value: '0', label: t('stats.singlePointOfFailure') },
  ];

  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-amantra-green-50/30 to-amantra-gold-50/20 dark:from-gray-950 dark:via-amantra-green-950/30 dark:to-amantra-gold-950/20 pt-20 pb-32">
        {/* Background Pattern */}
        <div className="absolute inset-0 islamic-pattern opacity-30" />

        <div className="container relative mx-auto px-4">
          <motion.div
            initial="initial"
            animate="animate"
            variants={stagger}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div variants={fadeInUp}>
              <Badge variant="gold" className="mb-6">
                <Zap className="w-3 h-3 mr-1" />
                {t('hero.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeInUp}
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6"
            >
              {t('hero.title')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amantra-green-600 to-amantra-green-500">
                {t('hero.titleHighlight')}
              </span>
            </motion.h1>

            <motion.p
              variants={fadeInUp}
              className="text-lg md:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href={`/${locale}/dashboard`}>
                <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  {t('hero.cta.primary')}
                </Button>
              </Link>
              <Link href={`/${locale}/how-it-works`}>
                <Button variant="outline" size="lg">
                  {t('hero.cta.secondary')}
                </Button>
              </Link>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              variants={fadeInUp}
              className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amantra-green-600" />
                <span>{t('hero.trust.shariaCompliant')}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amantra-green-600" />
                <span>{t('hero.trust.bankGrade')}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amantra-green-600" />
                <span>{t('hero.trust.zeroSPOF')}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-amantra-green-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-amantra-gold-400/10 rounded-full blur-3xl" />
      </section>

      {/* Stats Section */}
      <section className="relative -mt-16 z-10">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {stats.map((stat, index) => (
              <Card key={index} variant="elevated" className="text-center p-6">
                <div className="text-3xl md:text-4xl font-bold text-amantra-green-600 mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {stat.label}
                </div>
              </Card>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              {t('features.badge')}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('features.title')}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('features.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4`}>
                      <feature.icon className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Badge variant="gold" className="mb-4">
                {t('principles.badge')}
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                {t('principles.title')}
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
                {t('principles.subtitle')}
              </p>

              <div className="space-y-4">
                {principles.map((principle) => (
                  <div
                    key={principle.key}
                    className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amantra-green-100 dark:bg-amantra-green-900/50 flex items-center justify-center flex-shrink-0">
                      <principle.icon className="w-5 h-5 text-amantra-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {t(`principles.${principle.key}.title`)}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t(`principles.${principle.key}.description`)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-amantra-green-100 to-amantra-gold-100 dark:from-amantra-green-900/30 dark:to-amantra-gold-900/30 p-8 flex items-center justify-center">
                <div className="relative w-full h-full">
                  {/* Decorative Islamic Pattern */}
                  <div className="absolute inset-0 islamic-pattern opacity-20 rounded-xl" />

                  {/* Central Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full bg-white dark:bg-gray-800 shadow-2xl flex items-center justify-center">
                      <Shield className="w-16 h-16 text-amantra-green-600" />
                    </div>
                  </div>

                  {/* Orbiting Elements */}
                  <div className="absolute top-8 left-8 w-16 h-16 rounded-xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center animate-pulse-soft">
                    <Building2 className="w-8 h-8 text-amantra-gold-600" />
                  </div>
                  <div className="absolute top-8 right-8 w-16 h-16 rounded-xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center animate-pulse-soft" style={{ animationDelay: '0.5s' }}>
                    <Globe className="w-8 h-8 text-blue-600" />
                  </div>
                  <div className="absolute bottom-8 left-8 w-16 h-16 rounded-xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center animate-pulse-soft" style={{ animationDelay: '1s' }}>
                    <Scale className="w-8 h-8 text-purple-600" />
                  </div>
                  <div className="absolute bottom-8 right-8 w-16 h-16 rounded-xl bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center animate-pulse-soft" style={{ animationDelay: '1.5s' }}>
                    <Landmark className="w-8 h-8 text-teal-600" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <Badge variant="secondary" className="mb-4">
              {t('howItWorks.badge')}
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('howItWorks.title')}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('howItWorks.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {[1, 2, 3, 4].map((step) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: step * 0.1 }}
                className="relative"
              >
                {/* Connector Line */}
                {step < 4 && (
                  <div className="hidden md:block absolute top-8 left-1/2 w-full h-0.5 bg-gradient-to-r from-amantra-green-300 to-amantra-green-100 dark:from-amantra-green-700 dark:to-amantra-green-900" />
                )}

                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amantra-green-500 to-amantra-green-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4 shadow-lg">
                    {step}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {t(`howItWorks.step${step}.title`)}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t(`howItWorks.step${step}.description`)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-12"
          >
            <Link href={`/${locale}/how-it-works`}>
              <Button variant="outline" rightIcon={<ArrowRight className="w-4 h-4" />}>
                {t('howItWorks.learnMore')}
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amantra-green-600 to-amantra-green-700 p-12 md:p-16 text-center"
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 islamic-pattern opacity-10" />

            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {t('cta.title')}
              </h2>
              <p className="text-lg text-amantra-green-100 mb-8 max-w-2xl mx-auto">
                {t('cta.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href={`/${locale}/dashboard`}>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="bg-white text-amantra-green-700 hover:bg-gray-100"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    {t('cta.primary')}
                  </Button>
                </Link>
                <Link href={`/${locale}/about`}>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-white text-white hover:bg-white/10"
                  >
                    {t('cta.secondary')}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-amantra-gold-400/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          </motion.div>
        </div>
      </section>
    </div>
  );
}
