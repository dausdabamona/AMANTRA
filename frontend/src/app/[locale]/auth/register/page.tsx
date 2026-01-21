'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import {
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Shield,
  ArrowRight,
  Loader2,
  User,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

type IdentifierType = 'email' | 'phone';

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

function checkPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  let label = 'Weak';
  let color = 'bg-red-500';

  if (score >= 5) {
    label = 'Strong';
    color = 'bg-green-500';
  } else if (score >= 3) {
    label = 'Medium';
    color = 'bg-yellow-500';
  }

  return { score, label, color, checks };
}

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const { register, isLoading, error, isAuthenticated } = useAuthStore();

  const [identifierType, setIdentifierType] = React.useState<IdentifierType>('email');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const passwordStrength = checkPasswordStrength(password);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push(`/${locale}/dashboard`);
    }
  }, [isAuthenticated, router, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Validation
    if (!name.trim()) {
      setLocalError(t('auth.errors.nameRequired'));
      return;
    }

    if (identifierType === 'email' && !email) {
      setLocalError(t('auth.errors.emailRequired'));
      return;
    }

    if (identifierType === 'phone' && !phone) {
      setLocalError(t('auth.errors.phoneRequired'));
      return;
    }

    if (!password) {
      setLocalError(t('auth.errors.passwordRequired'));
      return;
    }

    if (passwordStrength.score < 3) {
      setLocalError(t('auth.errors.passwordTooWeak'));
      return;
    }

    if (password !== confirmPassword) {
      setLocalError(t('auth.errors.passwordMismatch'));
      return;
    }

    if (!acceptTerms) {
      setLocalError(t('auth.errors.acceptTerms'));
      return;
    }

    try {
      await register({
        name: name.trim(),
        email: identifierType === 'email' ? email : undefined,
        phone: identifierType === 'phone' ? phone : undefined,
        password,
      });
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
              {t('auth.createAccount')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {t('auth.registerDescription')}
            </p>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">{t('auth.register')}</CardTitle>
              <CardDescription>
                {t('auth.fillDetails')}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('auth.fullName')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                </div>

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

                {/* Email or Phone Input */}
                {identifierType === 'email' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@email.com"
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('auth.phoneNumber')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-gray-400" />
                      </div>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+6281234567890"
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                )}

                {/* Password Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('auth.password')}
                  </label>
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

                  {/* Password Strength Indicator */}
                  {password && (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors',
                              level <= passwordStrength.score
                                ? passwordStrength.color
                                : 'bg-gray-200 dark:bg-gray-700'
                            )}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div className={cn('flex items-center', passwordStrength.checks.length ? 'text-green-600' : 'text-gray-400')}>
                          {passwordStrength.checks.length ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                          {t('auth.passwordChecks.length')}
                        </div>
                        <div className={cn('flex items-center', passwordStrength.checks.uppercase ? 'text-green-600' : 'text-gray-400')}>
                          {passwordStrength.checks.uppercase ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                          {t('auth.passwordChecks.uppercase')}
                        </div>
                        <div className={cn('flex items-center', passwordStrength.checks.number ? 'text-green-600' : 'text-gray-400')}>
                          {passwordStrength.checks.number ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                          {t('auth.passwordChecks.number')}
                        </div>
                        <div className={cn('flex items-center', passwordStrength.checks.special ? 'text-green-600' : 'text-gray-400')}>
                          {passwordStrength.checks.special ? <Check className="w-3 h-3 mr-1" /> : <X className="w-3 h-3 mr-1" />}
                          {t('auth.passwordChecks.special')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm Password Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('auth.confirmPassword')}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="********"
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-500">{t('auth.errors.passwordMismatch')}</p>
                  )}
                </div>

                {/* Terms Checkbox */}
                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-amantra-green-600 focus:ring-amantra-green-500"
                    disabled={isLoading}
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600 dark:text-gray-400">
                    {t('auth.acceptTerms')}{' '}
                    <Link href={`/${locale}/terms`} className="text-amantra-green-600 hover:underline">
                      {t('auth.termsOfService')}
                    </Link>{' '}
                    {t('common.and')}{' '}
                    <Link href={`/${locale}/privacy`} className="text-amantra-green-600 hover:underline">
                      {t('auth.privacyPolicy')}
                    </Link>
                  </label>
                </div>

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
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  {t('auth.createAccount')}
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
                    {t('auth.haveAccount')}
                  </span>
                </div>
              </div>

              <Link href={`/${locale}/auth/login`} className="w-full">
                <Button variant="outline" className="w-full">
                  {t('auth.login')}
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Info */}
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
            {t('auth.syariahCompliant')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
