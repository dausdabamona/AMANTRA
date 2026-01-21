'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  FileText,
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  Trash2,
  Info,
  AlertCircle,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useWalletStore } from '@/store/wallet';

interface NewContractPageProps {
  params: { locale: string };
}

type AkadType = 'bay' | 'ijarah' | 'istisna' | 'murabaha';

interface FormData {
  title: string;
  description: string;
  akadType: AkadType;
  counterpartyAddress: string;
  amount: string;
  deadline: string;
  milestones: { description: string; percentage: number }[];
  documents: File[];
  terms: string;
  role: 'buyer' | 'seller';
}

export default function NewContractPage({ params }: NewContractPageProps) {
  const { locale } = params;
  const router = useRouter();
  const t = useTranslations();
  const { isConnected, address } = useWalletStore();

  const [step, setStep] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState<FormData>({
    title: '',
    description: '',
    akadType: 'bay',
    counterpartyAddress: '',
    amount: '',
    deadline: '',
    milestones: [{ description: '', percentage: 100 }],
    documents: [],
    terms: '',
    role: 'buyer',
  });

  const akadTypes = [
    {
      id: 'bay' as const,
      name: 'Bay (Sale)',
      description: 'Direct sale of goods or services with clear terms',
      suitable: ['Product purchases', 'Service agreements', 'Digital goods'],
    },
    {
      id: 'ijarah' as const,
      name: 'Ijarah (Lease/Service)',
      description: 'Rental or service agreement with temporary usage rights',
      suitable: ['Equipment rental', 'Professional services', 'Subscriptions'],
    },
    {
      id: 'istisna' as const,
      name: "Istisna' (Manufacturing)",
      description: 'Contract for manufacturing or construction',
      suitable: ['Custom products', 'Software development', 'Construction'],
    },
    {
      id: 'murabaha' as const,
      name: 'Murabaha (Cost-Plus)',
      description: 'Sale with disclosed cost and profit margin',
      suitable: ['Trade financing', 'Asset acquisition', 'Inventory purchase'],
    },
  ];

  const totalSteps = 4;

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const addMilestone = () => {
    const currentTotal = formData.milestones.reduce((sum, m) => sum + m.percentage, 0);
    if (currentTotal < 100) {
      updateFormData({
        milestones: [...formData.milestones, { description: '', percentage: 100 - currentTotal }],
      });
    }
  };

  const removeMilestone = (index: number) => {
    if (formData.milestones.length > 1) {
      const newMilestones = formData.milestones.filter((_, i) => i !== index);
      updateFormData({ milestones: newMilestones });
    }
  };

  const updateMilestone = (index: number, field: 'description' | 'percentage', value: string | number) => {
    const newMilestones = [...formData.milestones];
    newMilestones[index] = { ...newMilestones[index], [field]: value };
    updateFormData({ milestones: newMilestones });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    updateFormData({ documents: [...formData.documents, ...files] });
  };

  const removeDocument = (index: number) => {
    const newDocuments = formData.documents.filter((_, i) => i !== index);
    updateFormData({ documents: newDocuments });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // TODO: Implement smart contract interaction
      await new Promise((resolve) => setTimeout(resolve, 2000));
      router.push(`/${locale}/dashboard/contracts`);
    } catch (error) {
      console.error('Failed to create contract:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.title && formData.description && formData.akadType;
      case 2:
        return formData.counterpartyAddress && formData.amount && formData.deadline;
      case 3:
        return formData.milestones.every((m) => m.description) &&
          formData.milestones.reduce((sum, m) => sum + m.percentage, 0) === 100;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          {t('common.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('contracts.new.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('contracts.new.subtitle')}
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((s) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                      s < step
                        ? 'bg-amantra-green-500 text-white'
                        : s === step
                        ? 'bg-amantra-green-100 dark:bg-amantra-green-900/50 text-amantra-green-600 border-2 border-amantra-green-500'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                    }`}
                  >
                    {s < step ? <Check className="w-5 h-5" /> : s}
                  </div>
                  <span className={`text-xs mt-2 ${s === step ? 'text-amantra-green-600 font-medium' : 'text-gray-400'}`}>
                    {s === 1 && t('contracts.new.steps.basic')}
                    {s === 2 && t('contracts.new.steps.parties')}
                    {s === 3 && t('contracts.new.steps.milestones')}
                    {s === 4 && t('contracts.new.steps.review')}
                  </span>
                </div>
                {s < 4 && (
                  <div className={`flex-1 h-0.5 mx-4 ${s < step ? 'bg-amantra-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
      >
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('contracts.new.basic.title')}</CardTitle>
              <CardDescription>{t('contracts.new.basic.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.basic.role')}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {['buyer', 'seller'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => updateFormData({ role: role as 'buyer' | 'seller' })}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        formData.role === role
                          ? 'border-amantra-green-500 bg-amantra-green-50 dark:bg-amantra-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-gray-900 dark:text-white">
                        {role === 'buyer' ? t('contracts.asBuyer') : t('contracts.asSeller')}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {role === 'buyer'
                          ? t('contracts.new.basic.buyerDesc')
                          : t('contracts.new.basic.sellerDesc')}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Contract Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.basic.contractTitle')} *
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => updateFormData({ title: e.target.value })}
                  placeholder={t('contracts.new.basic.titlePlaceholder')}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.basic.description')} *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateFormData({ description: e.target.value })}
                  placeholder={t('contracts.new.basic.descriptionPlaceholder')}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-amantra-green-500 focus:border-transparent"
                />
              </div>

              {/* Akad Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.basic.akadType')} *
                </label>
                <div className="grid md:grid-cols-2 gap-4">
                  {akadTypes.map((akad) => (
                    <button
                      key={akad.id}
                      type="button"
                      onClick={() => updateFormData({ akadType: akad.id })}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        formData.akadType === akad.id
                          ? 'border-amantra-green-500 bg-amantra-green-50 dark:bg-amantra-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-gray-900 dark:text-white">{akad.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{akad.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {akad.suitable.map((use) => (
                          <Badge key={use} variant="outline" className="text-xs">
                            {use}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('contracts.new.parties.title')}</CardTitle>
              <CardDescription>{t('contracts.new.parties.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Counterparty Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {formData.role === 'buyer'
                    ? t('contracts.new.parties.sellerAddress')
                    : t('contracts.new.parties.buyerAddress')} *
                </label>
                <Input
                  type="text"
                  value={formData.counterpartyAddress}
                  onChange={(e) => updateFormData({ counterpartyAddress: e.target.value })}
                  placeholder="0x..."
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t('contracts.new.parties.addressHint')}
                </p>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.parties.amount')} *
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => updateFormData({ amount: e.target.value })}
                    placeholder="0.00"
                    className="pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">ETH</span>
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.parties.deadline')} *
                </label>
                <Input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => updateFormData({ deadline: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Terms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.parties.terms')}
                </label>
                <textarea
                  value={formData.terms}
                  onChange={(e) => updateFormData({ terms: e.target.value })}
                  placeholder={t('contracts.new.parties.termsPlaceholder')}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-amantra-green-500 focus:border-transparent"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('contracts.new.milestones.title')}</CardTitle>
              <CardDescription>{t('contracts.new.milestones.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Milestones */}
              <div className="space-y-4">
                {formData.milestones.map((milestone, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="w-8 h-8 rounded-full bg-amantra-green-100 dark:bg-amantra-green-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-amantra-green-600">{index + 1}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <Input
                        type="text"
                        value={milestone.description}
                        onChange={(e) => updateMilestone(index, 'description', e.target.value)}
                        placeholder={t('contracts.new.milestones.descriptionPlaceholder')}
                      />
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={milestone.percentage}
                            onChange={(e) => updateMilestone(index, 'percentage', parseInt(e.target.value) || 0)}
                            className="w-24"
                          />
                          <span className="ml-2 text-sm text-gray-400">%</span>
                        </div>
                        {formData.milestones.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMilestone(index)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Milestone Button */}
              <Button variant="outline" onClick={addMilestone} className="w-full">
                + {t('contracts.new.milestones.addMilestone')}
              </Button>

              {/* Total Percentage */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {t('contracts.new.milestones.total')}
                </span>
                <span className={`font-bold ${
                  formData.milestones.reduce((sum, m) => sum + m.percentage, 0) === 100
                    ? 'text-amantra-green-600'
                    : 'text-red-600'
                }`}>
                  {formData.milestones.reduce((sum, m) => sum + m.percentage, 0)}%
                </span>
              </div>

              {formData.milestones.reduce((sum, m) => sum + m.percentage, 0) !== 100 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{t('contracts.new.milestones.totalMustBe100')}</span>
                </div>
              )}

              {/* Document Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('contracts.new.milestones.documents')}
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="document-upload"
                  />
                  <label htmlFor="document-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('contracts.new.milestones.uploadHint')}
                    </p>
                  </label>
                </div>

                {formData.documents.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {formData.documents.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{file.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocument(index)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('contracts.new.review.title')}</CardTitle>
              <CardDescription>{t('contracts.new.review.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('contracts.new.review.contractTitle')}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white mt-1">{formData.title}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('contracts.new.review.akadType')}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white mt-1">
                      {akadTypes.find((a) => a.id === formData.akadType)?.name}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('contracts.new.review.yourRole')}
                    </p>
                    <Badge variant={formData.role === 'buyer' ? 'info' : 'gold'} className="mt-1">
                      {formData.role === 'buyer' ? t('contracts.asBuyer') : t('contracts.asSeller')}
                    </Badge>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('contracts.new.review.amount')}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white mt-1">{formData.amount} ETH</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('contracts.new.review.counterparty')}
                  </p>
                  <p className="font-mono text-sm text-gray-900 dark:text-white mt-1">{formData.counterpartyAddress}</p>
                </div>

                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {t('contracts.new.review.milestones')}
                  </p>
                  <div className="space-y-2">
                    {formData.milestones.map((milestone, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {index + 1}. {milestone.description}
                        </span>
                        <Badge variant="outline">{milestone.percentage}%</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sharia Compliance Notice */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amantra-green-50 dark:bg-amantra-green-900/20 border border-amantra-green-200 dark:border-amantra-green-800">
                <Shield className="w-5 h-5 text-amantra-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amantra-green-800 dark:text-amantra-green-300">
                    {t('contracts.new.review.shariaNotice.title')}
                  </p>
                  <p className="text-sm text-amantra-green-700 dark:text-amantra-green-400 mt-1">
                    {t('contracts.new.review.shariaNotice.description')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 1}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          {t('common.previous')}
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            {t('common.next')}
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canProceed() || isSubmitting}
            loading={isSubmitting}
          >
            {t('contracts.new.submit')}
          </Button>
        )}
      </div>
    </div>
  );
}
