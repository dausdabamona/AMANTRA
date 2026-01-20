'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Copy,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { calculateFileHash, cn } from '@/lib/utils';

interface HashVerifierProps {
  expectedHash?: string;
  contractId?: string;
  onVerified?: (isValid: boolean, hash: string) => void;
}

export function HashVerifier({ expectedHash, contractId, onVerified }: HashVerifierProps) {
  const t = useTranslations();
  const [file, setFile] = useState<File | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedHash, setCalculatedHash] = useState<string | null>(null);
  const [inputHash, setInputHash] = useState(expectedHash || '');
  const [verificationResult, setVerificationResult] = useState<'match' | 'mismatch' | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsCalculating(true);
    setVerificationResult(null);

    try {
      const hash = await calculateFileHash(selectedFile);
      setCalculatedHash(hash);

      // Auto-verify if expected hash is provided
      if (inputHash) {
        const isMatch = hash.toLowerCase() === inputHash.toLowerCase();
        setVerificationResult(isMatch ? 'match' : 'mismatch');
        onVerified?.(isMatch, hash);
      }
    } catch (error) {
      console.error('Failed to calculate hash:', error);
    } finally {
      setIsCalculating(false);
    }
  }, [inputHash, onVerified]);

  const handleVerify = useCallback(() => {
    if (!calculatedHash || !inputHash) return;

    const isMatch = calculatedHash.toLowerCase() === inputHash.toLowerCase();
    setVerificationResult(isMatch ? 'match' : 'mismatch');
    onVerified?.(isMatch, calculatedHash);
  }, [calculatedHash, inputHash, onVerified]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setCalculatedHash(null);
    setVerificationResult(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amantra-green-600" />
          {t('hashVerifier.title')}
        </CardTitle>
        <CardDescription>
          {t('hashVerifier.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('hashVerifier.uploadFile')}
          </label>
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
              file
                ? 'border-amantra-green-300 bg-amantra-green-50/50 dark:border-amantra-green-700 dark:bg-amantra-green-900/10'
                : 'border-gray-300 dark:border-gray-700 hover:border-amantra-green-300'
            )}
          >
            <input
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              id="hash-file-upload"
            />
            <label htmlFor="hash-file-upload" className="cursor-pointer">
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-8 h-8 text-amantra-green-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {file.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      reset();
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('hashVerifier.uploadHint')}
                  </p>
                </>
              )}
            </label>
          </div>
        </div>

        {/* Calculated Hash */}
        <AnimatePresence>
          {calculatedHash && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('hashVerifier.calculatedHash')}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-sm break-all">
                  {calculatedHash}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(calculatedHash)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expected Hash Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('hashVerifier.expectedHash')}
          </label>
          <Input
            type="text"
            value={inputHash}
            onChange={(e) => {
              setInputHash(e.target.value);
              setVerificationResult(null);
            }}
            placeholder="0x..."
            className="font-mono"
          />
          {contractId && (
            <p className="text-xs text-gray-400 mt-1">
              {t('hashVerifier.fromContract')}: {contractId}
            </p>
          )}
        </div>

        {/* Verify Button */}
        <Button
          onClick={handleVerify}
          disabled={!calculatedHash || !inputHash || isCalculating}
          isLoading={isCalculating}
          className="w-full"
        >
          {isCalculating ? t('hashVerifier.calculating') : t('hashVerifier.verify')}
        </Button>

        {/* Verification Result */}
        <AnimatePresence>
          {verificationResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                'p-4 rounded-lg flex items-start gap-3',
                verificationResult === 'match'
                  ? 'bg-amantra-green-50 dark:bg-amantra-green-900/20 border border-amantra-green-200 dark:border-amantra-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              )}
            >
              {verificationResult === 'match' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-amantra-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amantra-green-800 dark:text-amantra-green-300">
                      {t('hashVerifier.result.match.title')}
                    </p>
                    <p className="text-sm text-amantra-green-700 dark:text-amantra-green-400 mt-1">
                      {t('hashVerifier.result.match.description')}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-300">
                      {t('hashVerifier.result.mismatch.title')}
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      {t('hashVerifier.result.mismatch.description')}
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-blue-700 dark:text-blue-300">
            {t('hashVerifier.info')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
