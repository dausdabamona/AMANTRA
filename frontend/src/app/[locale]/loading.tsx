'use client';

import { Shield } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
      <div className="text-center">
        <div className="relative inline-flex">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amantra-green-500 to-amantra-green-700 flex items-center justify-center animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amantra-gold-500 border-4 border-white dark:border-gray-950 animate-pulse" />
        </div>
        <div className="mt-6">
          <div className="h-1 w-32 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amantra-green-500 to-amantra-gold-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
      <style jsx>{`
        @keyframes loading {
          0% {
            width: 0%;
            margin-left: 0%;
          }
          50% {
            width: 100%;
            margin-left: 0%;
          }
          100% {
            width: 0%;
            margin-left: 100%;
          }
        }
      `}</style>
    </div>
  );
}
