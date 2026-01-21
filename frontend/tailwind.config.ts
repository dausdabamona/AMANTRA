import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AMANTRA Brand Colors
        amantra: {
          green: {
            50: '#f0fdf4',
            100: '#dcfce7',
            200: '#bbf7d0',
            300: '#86efac',
            400: '#4ade80',
            500: '#22c55e',
            600: '#16a34a',
            700: '#15803d',
            800: '#166534',
            900: '#14532d',
            950: '#052e16',
          },
          gold: {
            50: '#fffbeb',
            100: '#fef3c7',
            200: '#fde68a',
            300: '#fcd34d',
            400: '#fbbf24',
            500: '#f59e0b',
            600: '#d97706',
            700: '#b45309',
            800: '#92400e',
            900: '#78350f',
          },
          sage: {
            50: '#f6f7f6',
            100: '#e3e5e3',
            200: '#c7cbc6',
            300: '#a3a9a2',
            400: '#7f867d',
            500: '#646b63',
            600: '#4f554e',
            700: '#414541',
            800: '#363936',
            900: '#2f312f',
          },
        },
        // Semantic Colors
        primary: {
          DEFAULT: '#16a34a',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#f59e0b',
          foreground: '#ffffff',
        },
        background: {
          DEFAULT: '#ffffff',
          secondary: '#f8fafc',
        },
        foreground: {
          DEFAULT: '#1e293b',
          muted: '#64748b',
        },
        border: {
          DEFAULT: '#e2e8f0',
          focus: '#16a34a',
        },
        // Status Colors
        success: {
          DEFAULT: '#22c55e',
          background: '#f0fdf4',
          foreground: '#166534',
        },
        warning: {
          DEFAULT: '#f59e0b',
          background: '#fffbeb',
          foreground: '#92400e',
        },
        error: {
          DEFAULT: '#ef4444',
          background: '#fef2f2',
          foreground: '#991b1b',
        },
        info: {
          DEFAULT: '#3b82f6',
          background: '#eff6ff',
          foreground: '#1e40af',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        arabic: ['Noto Sans Arabic', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }],
      },
      borderRadius: {
        'amantra': '0.75rem',
      },
      boxShadow: {
        'amantra': '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        'amantra-lg': '0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
        'amantra-xl': '0 20px 25px -5px rgb(0 0 0 / 0.05), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
      },
      backgroundImage: {
        'islamic-pattern': "url('/patterns/islamic-geometric.svg')",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'countdown': 'countdown 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        countdown: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
