import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';
import { ContractStatus, MultisigRole, SystemMode, ResolutionType } from '@/types';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format address for display (0x1234...5678)
 */
export function formatAddress(address: string, chars = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format amount with currency
 */
export function formatAmount(
  amount: bigint | string | number,
  currency = 'IDR',
  locale = 'id-ID'
): string {
  const value = typeof amount === 'bigint' ? Number(amount) / 1e18 : Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format amount in ETH/Wei
 */
export function formatEther(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(decimals);
}

/**
 * Parse ether string to wei
 */
export function parseEther(ether: string): bigint {
  const [whole, fraction = ''] = ether.split('.');
  const paddedFraction = fraction.padEnd(18, '0').slice(0, 18);
  return BigInt(whole + paddedFraction);
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: number, locale = 'id'): string {
  return formatDistanceToNow(new Date(timestamp * 1000), {
    addSuffix: true,
    locale: locale === 'id' ? idLocale : enUS,
  });
}

/**
 * Format timestamp to absolute date
 */
export function formatDate(timestamp: number, formatStr = 'PPP', locale = 'id'): string {
  return format(new Date(timestamp * 1000), formatStr, {
    locale: locale === 'id' ? idLocale : enUS,
  });
}

/**
 * Format timestamp to datetime
 */
export function formatDateTime(timestamp: number, locale = 'id'): string {
  return format(new Date(timestamp * 1000), 'PPP HH:mm', {
    locale: locale === 'id' ? idLocale : enUS,
  });
}

/**
 * Calculate days remaining until timestamp
 */
export function daysUntil(timestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, Math.ceil((timestamp - now) / (24 * 60 * 60)));
}

/**
 * Calculate time remaining as object
 */
export function timeRemaining(timestamp: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, timestamp - now);

  if (diff === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  return {
    days: Math.floor(diff / (24 * 60 * 60)),
    hours: Math.floor((diff % (24 * 60 * 60)) / (60 * 60)),
    minutes: Math.floor((diff % (60 * 60)) / 60),
    seconds: diff % 60,
    expired: false,
  };
}

/**
 * Get contract status label
 */
export function getStatusLabel(status: ContractStatus, locale = 'id'): string {
  const labels: Record<ContractStatus, Record<string, string>> = {
    [ContractStatus.CREATED]: { id: 'Dibuat', en: 'Created' },
    [ContractStatus.FUNDED]: { id: 'Didanai', en: 'Funded' },
    [ContractStatus.VERIFIED]: { id: 'Diverifikasi', en: 'Verified' },
    [ContractStatus.SETTLED]: { id: 'Diselesaikan', en: 'Settled' },
    [ContractStatus.DISPUTED]: { id: 'Disengketakan', en: 'Disputed' },
    [ContractStatus.CANCELLED]: { id: 'Dibatalkan', en: 'Cancelled' },
  };
  return labels[status]?.[locale] || labels[status]?.['en'] || 'Unknown';
}

/**
 * Get status color class
 */
export function getStatusColor(status: ContractStatus): string {
  const colors: Record<ContractStatus, string> = {
    [ContractStatus.CREATED]: 'bg-blue-100 text-blue-800',
    [ContractStatus.FUNDED]: 'bg-yellow-100 text-yellow-800',
    [ContractStatus.VERIFIED]: 'bg-purple-100 text-purple-800',
    [ContractStatus.SETTLED]: 'bg-green-100 text-green-800',
    [ContractStatus.DISPUTED]: 'bg-red-100 text-red-800',
    [ContractStatus.CANCELLED]: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Get multisig role label
 */
export function getRoleLabel(role: MultisigRole, locale = 'id'): string {
  const labels: Record<MultisigRole, Record<string, string>> = {
    [MultisigRole.OPERATOR]: { id: 'Operator', en: 'Operator' },
    [MultisigRole.ORACLE]: { id: 'Oracle', en: 'Oracle' },
    [MultisigRole.EMERGENCY]: { id: 'Darurat', en: 'Emergency' },
    [MultisigRole.ARBITRATION_COUNCIL]: { id: 'Majelis Arbitrase', en: 'Arbitration Council' },
    [MultisigRole.HISBAH]: { id: 'Dewan Hisbah', en: 'Hisbah Council' },
    [MultisigRole.BACKUP]: { id: 'Cadangan', en: 'Backup' },
  };
  return labels[role]?.[locale] || labels[role]?.['en'] || 'Unknown';
}

/**
 * Get system mode label
 */
export function getSystemModeLabel(mode: SystemMode, locale = 'id'): string {
  const labels: Record<SystemMode, Record<string, string>> = {
    [SystemMode.NORMAL]: { id: 'Normal', en: 'Normal' },
    [SystemMode.EMERGENCY]: { id: 'Darurat', en: 'Emergency' },
    [SystemMode.RECOVERY]: { id: 'Pemulihan', en: 'Recovery' },
    [SystemMode.DISSOLUTION]: { id: 'Pembubaran', en: 'Dissolution' },
  };
  return labels[mode]?.[locale] || labels[mode]?.['en'] || 'Unknown';
}

/**
 * Get resolution type label
 */
export function getResolutionLabel(type: ResolutionType, locale = 'id'): string {
  const labels: Record<ResolutionType, Record<string, string>> = {
    [ResolutionType.CONTINUE_SETTLEMENT]: { id: 'Lanjutkan Penyelesaian', en: 'Continue Settlement' },
    [ResolutionType.REFUND_BUYER]: { id: 'Kembalikan ke Pembeli', en: 'Refund to Buyer' },
    [ResolutionType.PAY_SELLER]: { id: 'Bayarkan ke Penjual', en: 'Pay to Seller' },
    [ResolutionType.CUSTOM_SPLIT]: { id: 'Pembagian Kustom', en: 'Custom Split' },
  };
  return labels[type]?.[locale] || labels[type]?.['en'] || 'Unknown';
}

/**
 * Calculate hash of data
 */
export async function calculateHash(data: string | ArrayBuffer): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate file hash
 */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return calculateHash(buffer);
}

/**
 * Verify hash matches
 */
export function verifyHash(hash1: string, hash2: string): boolean {
  return hash1.toLowerCase() === hash2.toLowerCase();
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate random ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);
  }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Check if value is empty
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
