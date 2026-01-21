'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Detect browser language
    const browserLang = navigator.language?.split('-')[0];
    const supportedLocales = ['id', 'en'];
    const locale = supportedLocales.includes(browserLang) ? browserLang : 'id';

    // Redirect to locale
    router.replace(`/${locale}/`);
  }, [router]);

  // Loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <p className="text-gray-500">Loading AMANTRA...</p>
      </div>
    </div>
  );
}
