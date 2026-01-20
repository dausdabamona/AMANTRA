'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Something went wrong
        </h1>

        <p className="text-gray-500 dark:text-gray-400 mb-8">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>

        {error.digest && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={reset}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline" leftIcon={<Home className="w-4 h-4" />}>
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
