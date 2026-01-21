'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Mail, Phone, Lock, Eye, EyeOff, Shield, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

type LoginMethod = 'password' | 'otp';
type IdentifierType = 'email' | 'phone';

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const { login, loginWithOTP, sendOTP, isLoading, error, isAuthenticated } = useAuthStore();

  const [loginMethod, setLoginMethod] = React.useState<LoginMethod>('password');
  const [identifierType, setIdentifierType] = React.useState<IdentifierType>('email');
  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [otpSent, setOtpSent] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push(`/${locale}/dashboard`);
    }
  }, [isAuthenticated, router, locale]);

  const handleSendOTP = async () => {
    if (!identifier) {
      setLocalError(t('auth.errors.identifierRequired'));
      return;
    }

    try {
      setLocalError(null);
      await sendOTP(identifier, identifierType === 'email' ? 'email' : 'sms');
      setOtpSent(true);
    } catch {
      // Error is handled by the store
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!identifier) {
      setLocalError(t('auth.errors.identifierRequired'));
      return;
    }

    try {
      if (loginMethod === 'password') {
        if (!password) {
          setLocalError(t('auth.errors.passwordRequired'));
          return;
        }
        await login(identifier, password);
      } else {
        if (!otp) {
          setLocalError(t('auth.errors.otpRequired'));
          return;
        }
        await loginWithOTP(identifier, otp);
      }
      router.push(`/${locale}/dashboard`);
    } catch {
      // Error is handled by the store
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen pt-20 pb-12 flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto"
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amantra-green-500 to-amantra-green-700 mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('auth.welcomeBack')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {t('auth.loginDescription')}
            </p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">{t('auth.login')}</CardTitle>
              <CardDescription>
                {t('auth.chooseLoginMethod')}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Login Method Toggle */}
              <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1 mb-6">
                <button
                  type="button"
                  onClick={() => setLoginMethod('password')}
                  className={cn(
                    'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors',
                    loginMethod === 'password'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  {t('auth.withPassword')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('otp');
                    setOtpSent(false);
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors',
                    loginMethod === 'otp'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  {t('auth.withOTP')}
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Identifier Type Toggle */}
                <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                  <button
                    type="button"
                    onClick={() => setIdentifierType('email')}
                    className={cn(
                      'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors flex items-center justify-center',
                      identifierType === 'email'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdentifierType('phone')}
                    className={cn(
                      'flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors flex items-center justify-center',
                      identifierType === 'phone'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    {t('auth.phone')}
                  </button>
                </div>

                {/* Identifier Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {identifierType === 'email' ? 'Email' : t('auth.phoneNumber')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      {identifierType === 'email' ? (
                        <Mail className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Phone className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <Input
                      type={identifierType === 'email' ? 'email' : 'tel'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={identifierType === 'email' ? 'nama@email.com' : '+6281234567890'}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Password or OTP Input */}
                {loginMethod === 'password' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('auth.password')}
                      </label>
                      <Link
                        href={`/${locale}/auth/forgot-password`}
                        className="text-sm text-amantra-green-600 hover:text-amantra-green-700"
                      >
                        {t('auth.forgotPassword')}
                      </Link>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="********"
                        className="pl-10 pr-10"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5 text-gray-400" />
                        ) : (
                          <Eye className="h-5 w-5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {!otpSent ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={handleSendOTP}
                        disabled={isLoading || !identifier}
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        {t('auth.sendOTP')}
                      </Button>
                    ) : (
                      <>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('auth.enterOTP')}
                        </label>
                        <Input
                          type="text"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          className="text-center text-2xl tracking-widest"
                          maxLength={6}
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={handleSendOTP}
                          className="text-sm text-amantra-green-600 hover:text-amantra-green-700"
                          disabled={isLoading}
                        >
                          {t('auth.resendOTP')}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {displayError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  >
                    <p className="text-sm text-red-600 dark:text-red-400">{displayError}</p>
                  </motion.div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || (loginMethod === 'otp' && !otpSent)}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  {t('auth.login')}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-0">
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">
                    {t('auth.noAccount')}
                  </span>
                </div>
              </div>

              <Link href={`/${locale}/auth/register`} className="w-full">
                <Button variant="outline" className="w-full">
                  {t('auth.createAccount')}
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Info */}
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            {t('auth.secureLogin')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
