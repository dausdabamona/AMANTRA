'use client';

import Link from 'next/link';
import { Search, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
          <Search className="w-8 h-8 text-gray-400" />
        </div>

        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-2">
          404
        </h1>

        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Page Not Found
        </h2>

        <p className="text-gray-500 dark:text-gray-400 mb-8">
          The page you're looking for doesn't exist or has been moved. Please check the URL or navigate back to the homepage.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/">
            <Button leftIcon={<Home className="w-4 h-4" />}>
              Go Home
            </Button>
          </Link>
          <Button
            variant="outline"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => window.history.back()}
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
