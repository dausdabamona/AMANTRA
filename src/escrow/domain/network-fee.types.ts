/**
 * AMANTRA - Network Fee Types
 *
 * Domain types for bank network transfer fee handling.
 * Implements the akad principle: "Tidak boleh ada potongan tersembunyi"
 * (No hidden deductions allowed)
 *
 * These types ensure:
 * 1. Network fee bearer is declared at contract creation
 * 2. Fee handling is transparent to all parties
 * 3. Settlement follows the declared policy
 * 4. Complete audit trail is maintained
 *
 * @module escrow/domain
 */

import * as crypto from 'crypto';

/**
 * Defines who bears bank network transfer fees (BI-FAST/RTGS/interbank)
 * Set immutably at contract creation (Akad stage)
 */
export enum NetworkFeeBearer {
  /**
   * AMANTRA (platform) absorbs all bank transfer fees.
   * Seller receives full sellerAmount.
   * Bank fees deducted from platformFee.
   */
  PLATFORM = 0,

  /**
   * Seller bears bank transfer fees.
   * Seller receives sellerAmount - actualNetworkFee.
   * Reduction is shown clearly in settlement breakdown.
   */
  SELLER = 1,

  /**
   * Buyer pays additional network fee.
   * Network fee added to escrow amount at funding.
   * Seller still receives full sellerAmount.
   */
  BUYER = 2,
}

/**
 * Human-readable descriptions for network fee bearers
 */
export const NetworkFeeBearerDescription: Record<NetworkFeeBearer, string> = {
  [NetworkFeeBearer.PLATFORM]:
    'AMANTRA (Platform) menanggung seluruh biaya transfer bank',
  [NetworkFeeBearer.SELLER]:
    'Penjual menanggung biaya transfer bank (dipotong dari pembayaran)',
  [NetworkFeeBearer.BUYER]:
    'Pembeli membayar biaya transfer bank tambahan (ditambahkan ke escrow)',
};

/**
 * Converts NetworkFeeBearer to string for display/storage
 */
export function networkFeeBearerToString(bearer: NetworkFeeBearer): string {
  switch (bearer) {
    case NetworkFeeBearer.PLATFORM:
      return 'PLATFORM';
    case NetworkFeeBearer.SELLER:
      return 'SELLER';
    case NetworkFeeBearer.BUYER:
      return 'BUYER';
    default:
      throw new Error(`Unknown NetworkFeeBearer: ${bearer}`);
  }
}

/**
 * Parses string to NetworkFeeBearer enum
 */
export function parseNetworkFeeBearer(value: string | number): NetworkFeeBearer {
  if (typeof value === 'number') {
    if (value >= 0 && value <= 2) {
      return value as NetworkFeeBearer;
    }
    throw new Error(`Invalid NetworkFeeBearer number: ${value}`);
  }

  switch (value.toUpperCase()) {
    case 'PLATFORM':
    case '0':
      return NetworkFeeBearer.PLATFORM;
    case 'SELLER':
    case '1':
      return NetworkFeeBearer.SELLER;
    case 'BUYER':
    case '2':
      return NetworkFeeBearer.BUYER;
    default:
      throw new Error(`Invalid NetworkFeeBearer string: ${value}`);
  }
}

/**
 * Network fee configuration at contract creation (Akad stage)
 */
export interface NetworkFeeConfig {
  /**
   * Who bears the bank network transfer fees
   */
  bearer: NetworkFeeBearer;

  /**
   * Estimated network fee at time of akad (for disclosure)
   * This is an estimate - actual fee may vary slightly
   */
  estimatedFee: number;

  /**
   * Currency of the estimated fee
   */
  currency: string;
}

/**
 * Network fee record after settlement (for audit)
 */
export interface NetworkFeeSettlementRecord {
  /**
   * Declared bearer at contract creation
   */
  declaredBearer: NetworkFeeBearer;

  /**
   * Estimated fee at contract creation
   */
  estimatedFee: number;

  /**
   * Actual fee charged by bank
   */
  actualFee: number;

  /**
   * Net amount seller actually received
   */
  sellerNetReceived: number;

  /**
   * Net amount platform actually received
   */
  platformNetReceived: number;

  /**
   * Hash of bank transfer receipts
   */
  bankReceiptHash: string;

  /**
   * Timestamp of settlement
   */
  settledAt: Date;
}

/**
 * Akad fee disclosure statement
 *
 * This statement must be:
 * 1. Stored in database
 * 2. Hashed to blockchain
 * 3. Included in digital contract PDF
 * 4. Signed by both parties
 */
export interface AkadFeeDisclosure {
  /**
   * Contract identifier
   */
  contractId: string;

  /**
   * Total transaction amount
   */
  totalAmount: number;

  /**
   * Platform fee amount
   */
  platformFee: number;

  /**
   * Net amount for seller (before network fees if applicable)
   */
  sellerAmount: number;

  /**
   * Mediator fee amount (0 if no mediator)
   */
  mediatorFee: number;

  /**
   * Who bears network transfer fees
   */
  networkFeeBearer: NetworkFeeBearer;

  /**
   * Estimated network fee
   */
  estimatedNetworkFee: number;

  /**
   * Currency
   */
  currency: string;

  /**
   * Calculated net amount seller will receive after network fees
   */
  sellerNetAfterFees: number;

  /**
   * Localized disclosure statement text
   */
  disclosureText: string;

  /**
   * Timestamp when disclosure was generated
   */
  generatedAt: Date;
}

/**
 * Generates the akad fee disclosure text in Indonesian
 */
export function generateAkadDisclosureText(disclosure: AkadFeeDisclosure): string {
  const bearerText = NetworkFeeBearerDescription[disclosure.networkFeeBearer];

  const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: disclosure.currency,
      minimumFractionDigits: 0,
    }).format(amount);

  const lines = [
    '='.repeat(60),
    'AKAD KETENTUAN BIAYA TRANSAKSI',
    '(Fee Terms Agreement)',
    '='.repeat(60),
    '',
    `Nomor Kontrak: ${disclosure.contractId}`,
    `Tanggal: ${disclosure.generatedAt.toLocaleDateString('id-ID')}`,
    '',
    'RINCIAN BIAYA:',
    `- Total Transaksi: ${formatCurrency(disclosure.totalAmount)}`,
    `- Biaya Platform: ${formatCurrency(disclosure.platformFee)}`,
    `- Jumlah untuk Penjual: ${formatCurrency(disclosure.sellerAmount)}`,
  ];

  if (disclosure.mediatorFee > 0) {
    lines.push(`- Biaya Mediator: ${formatCurrency(disclosure.mediatorFee)}`);
  }

  lines.push(
    '',
    'BIAYA TRANSFER BANK:',
    `- Penanggung Biaya: ${bearerText}`,
    `- Estimasi Biaya Transfer: ${formatCurrency(disclosure.estimatedNetworkFee)}`,
    '',
    'JUMLAH BERSIH YANG AKAN DITERIMA PENJUAL:',
    `${formatCurrency(disclosure.sellerNetAfterFees)}`,
    '',
    '='.repeat(60),
    'PERNYATAAN AKAD:',
    '='.repeat(60),
    '',
    `"Biaya transfer bank (jika ada) ditanggung oleh: ${networkFeeBearerToString(disclosure.networkFeeBearer)}.`,
    `Jumlah bersih yang diterima penjual setelah biaya bank: ${formatCurrency(disclosure.sellerNetAfterFees)}.`,
    'Tidak ada potongan lain selain yang disepakati di akad."',
    '',
    '='.repeat(60),
    'Dengan menandatangani kontrak ini, kedua pihak menyetujui',
    'ketentuan biaya yang tercantum di atas.',
    '='.repeat(60),
  );

  return lines.join('\n');
}

/**
 * Calculates seller's net amount after network fees based on bearer
 */
export function calculateSellerNetAfterFees(
  sellerAmount: number,
  estimatedNetworkFee: number,
  bearer: NetworkFeeBearer
): number {
  switch (bearer) {
    case NetworkFeeBearer.PLATFORM:
      // Platform pays fees, seller gets full amount
      return sellerAmount;

    case NetworkFeeBearer.SELLER:
      // Seller pays fees, deducted from their amount
      return Math.max(0, sellerAmount - estimatedNetworkFee);

    case NetworkFeeBearer.BUYER:
      // Buyer pays fees separately, seller gets full amount
      return sellerAmount;

    default:
      return sellerAmount;
  }
}

/**
 * Generates hash of akad disclosure for blockchain storage
 */
export function hashAkadDisclosure(disclosure: AkadFeeDisclosure): string {
  const data = [
    disclosure.contractId,
    disclosure.totalAmount.toString(),
    disclosure.platformFee.toString(),
    disclosure.sellerAmount.toString(),
    disclosure.mediatorFee.toString(),
    disclosure.networkFeeBearer.toString(),
    disclosure.estimatedNetworkFee.toString(),
    disclosure.currency,
    disclosure.sellerNetAfterFees.toString(),
    disclosure.generatedAt.toISOString(),
  ].join('|');

  return '0x' + crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Creates a complete akad fee disclosure object
 */
export function createAkadFeeDisclosure(params: {
  contractId: string;
  totalAmount: number;
  platformFee: number;
  sellerAmount: number;
  mediatorFee: number;
  networkFeeBearer: NetworkFeeBearer;
  estimatedNetworkFee: number;
  currency: string;
}): AkadFeeDisclosure {
  const sellerNetAfterFees = calculateSellerNetAfterFees(
    params.sellerAmount,
    params.estimatedNetworkFee,
    params.networkFeeBearer
  );

  const disclosure: AkadFeeDisclosure = {
    ...params,
    sellerNetAfterFees,
    disclosureText: '', // Will be generated below
    generatedAt: new Date(),
  };

  disclosure.disclosureText = generateAkadDisclosureText(disclosure);

  return disclosure;
}

/**
 * Validates network fee configuration for consistency
 */
export function validateNetworkFeeConfig(
  config: NetworkFeeConfig,
  platformFee: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.estimatedFee < 0) {
    errors.push('Estimated network fee cannot be negative');
  }

  if (config.bearer === NetworkFeeBearer.PLATFORM && config.estimatedFee > platformFee) {
    errors.push(
      `Platform fee (${platformFee}) must be >= estimated network fee (${config.estimatedFee}) when PLATFORM bears fees`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
