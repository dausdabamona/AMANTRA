/**
 * AMANTRA - Network Fee Scenarios Unit Tests
 *
 * Tests for the 3 network fee bearer scenarios:
 * 1. PLATFORM - AMANTRA absorbs all bank transfer fees
 * 2. SELLER - Seller bears bank transfer fees
 * 3. BUYER - Buyer pays additional network fee
 *
 * ETHICAL PRINCIPLE: "Tidak boleh ada potongan tersembunyi"
 * (No hidden deductions allowed)
 *
 * Each test verifies:
 * - Fee declaration at akad (contract creation)
 * - Fee visibility to all parties
 * - Correct settlement calculation
 * - Audit trail completeness
 */

import {
  NetworkFeeBearer,
  NetworkFeeConfig,
  calculateSellerNetAfterFees,
  createAkadFeeDisclosure,
  generateAkadDisclosureText,
  hashAkadDisclosure,
  validateNetworkFeeConfig,
  networkFeeBearerToString,
  parseNetworkFeeBearer,
} from '../domain/network-fee.types';
import { SplitPayment, SplitPaymentProps } from '../domain/split-payment.value';

describe('NetworkFeeBearer Enum', () => {
  describe('networkFeeBearerToString', () => {
    it('should convert PLATFORM to string', () => {
      expect(networkFeeBearerToString(NetworkFeeBearer.PLATFORM)).toBe('PLATFORM');
    });

    it('should convert SELLER to string', () => {
      expect(networkFeeBearerToString(NetworkFeeBearer.SELLER)).toBe('SELLER');
    });

    it('should convert BUYER to string', () => {
      expect(networkFeeBearerToString(NetworkFeeBearer.BUYER)).toBe('BUYER');
    });
  });

  describe('parseNetworkFeeBearer', () => {
    it('should parse string values', () => {
      expect(parseNetworkFeeBearer('PLATFORM')).toBe(NetworkFeeBearer.PLATFORM);
      expect(parseNetworkFeeBearer('SELLER')).toBe(NetworkFeeBearer.SELLER);
      expect(parseNetworkFeeBearer('BUYER')).toBe(NetworkFeeBearer.BUYER);
    });

    it('should parse numeric values', () => {
      expect(parseNetworkFeeBearer(0)).toBe(NetworkFeeBearer.PLATFORM);
      expect(parseNetworkFeeBearer(1)).toBe(NetworkFeeBearer.SELLER);
      expect(parseNetworkFeeBearer(2)).toBe(NetworkFeeBearer.BUYER);
    });

    it('should throw on invalid values', () => {
      expect(() => parseNetworkFeeBearer('INVALID')).toThrow();
      expect(() => parseNetworkFeeBearer(99)).toThrow();
    });
  });
});

describe('Scenario 1: PLATFORM Bears Network Fees', () => {
  const baseProps: SplitPaymentProps = {
    contractId: 'contract-platform-test-001',
    totalAmount: 10_000_000, // Rp 10,000,000
    currency: 'IDR',
    sellerAmount: 9_500_000, // Rp 9,500,000
    platformFee: 500_000,    // Rp 500,000 (5%)
    mediatorFee: 0,
    sellerAccount: {
      accountNumber: '1234567890123',
      bankCode: 'BSI',
      accountName: 'Seller Test',
    },
    platformAccount: {
      accountNumber: '9876543210123',
      bankCode: 'BSI',
      accountName: 'AMANTRA Revenue',
    },
    networkFeeConfig: {
      bearer: NetworkFeeBearer.PLATFORM,
      estimatedFee: 6_500, // Rp 6,500 (BI-FAST fee)
      currency: 'IDR',
    },
    akadStatementHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  };

  describe('Akad Stage (Contract Creation)', () => {
    it('should validate network fee config - platform fee must cover network fee', () => {
      const config: NetworkFeeConfig = {
        bearer: NetworkFeeBearer.PLATFORM,
        estimatedFee: 6_500,
        currency: 'IDR',
      };

      const result = validateNetworkFeeConfig(config, 500_000);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if platform fee insufficient for network fee', () => {
      const config: NetworkFeeConfig = {
        bearer: NetworkFeeBearer.PLATFORM,
        estimatedFee: 600_000, // More than platform fee
        currency: 'IDR',
      };

      const result = validateNetworkFeeConfig(config, 500_000);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be >=');
    });

    it('should create SplitPayment with network fee config', () => {
      const payment = SplitPayment.create(baseProps);

      expect(payment.networkFeeBearer).toBe(NetworkFeeBearer.PLATFORM);
      expect(payment.estimatedNetworkFee).toBe(6_500);
      expect(payment.akadStatementHash).toBe(baseProps.akadStatementHash);
    });

    it('should calculate seller net = full seller amount (PLATFORM bears fees)', () => {
      const sellerNet = calculateSellerNetAfterFees(
        9_500_000,
        6_500,
        NetworkFeeBearer.PLATFORM
      );

      expect(sellerNet).toBe(9_500_000); // Full amount
    });
  });

  describe('Settlement Calculation', () => {
    it('should calculate actual amounts with PLATFORM bearing fees', () => {
      const payment = SplitPayment.create(baseProps);
      const actualNetworkFee = 6_500;

      const amounts = payment.calculateActualAmounts(actualNetworkFee);

      expect(amounts.sellerNetReceived).toBe(9_500_000); // Full amount
      expect(amounts.platformNetReceived).toBe(500_000 - 6_500); // Platform pays fee
      expect(amounts.networkFeeAbsorbedBy).toBe('PLATFORM');
      expect(amounts.feeVariance).toBe(0); // No variance
    });

    it('should handle higher actual fee than estimated', () => {
      const payment = SplitPayment.create(baseProps);
      const actualNetworkFee = 10_000; // Higher than estimated

      const amounts = payment.calculateActualAmounts(actualNetworkFee);

      expect(amounts.sellerNetReceived).toBe(9_500_000); // Still full amount
      expect(amounts.platformNetReceived).toBe(500_000 - 10_000); // Platform absorbs difference
      expect(amounts.feeVariance).toBe(10_000 - 6_500); // 3,500 variance
    });
  });

  describe('Akad Disclosure', () => {
    it('should generate disclosure text with PLATFORM as fee bearer', () => {
      const disclosure = createAkadFeeDisclosure({
        contractId: 'contract-001',
        totalAmount: 10_000_000,
        platformFee: 500_000,
        sellerAmount: 9_500_000,
        mediatorFee: 0,
        networkFeeBearer: NetworkFeeBearer.PLATFORM,
        estimatedNetworkFee: 6_500,
        currency: 'IDR',
      });

      expect(disclosure.sellerNetAfterFees).toBe(9_500_000);
      expect(disclosure.disclosureText).toContain('PLATFORM');
      expect(disclosure.disclosureText).toContain('menanggung');
      expect(disclosure.disclosureText).toContain('Tidak ada potongan lain');
    });
  });
});

describe('Scenario 2: SELLER Bears Network Fees', () => {
  const baseProps: SplitPaymentProps = {
    contractId: 'contract-seller-test-001',
    totalAmount: 10_000_000,
    currency: 'IDR',
    sellerAmount: 9_500_000,
    platformFee: 500_000,
    mediatorFee: 0,
    sellerAccount: {
      accountNumber: '1234567890123',
      bankCode: 'BSI',
      accountName: 'Seller Test',
    },
    platformAccount: {
      accountNumber: '9876543210123',
      bankCode: 'BSI',
      accountName: 'AMANTRA Revenue',
    },
    networkFeeConfig: {
      bearer: NetworkFeeBearer.SELLER,
      estimatedFee: 6_500,
      currency: 'IDR',
    },
    akadStatementHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  };

  describe('Akad Stage (Contract Creation)', () => {
    it('should calculate seller net = seller amount - estimated network fee', () => {
      const sellerNet = calculateSellerNetAfterFees(
        9_500_000,
        6_500,
        NetworkFeeBearer.SELLER
      );

      expect(sellerNet).toBe(9_500_000 - 6_500); // Rp 9,493,500
    });

    it('should create SplitPayment with SELLER as fee bearer', () => {
      const payment = SplitPayment.create(baseProps);

      expect(payment.networkFeeBearer).toBe(NetworkFeeBearer.SELLER);
      expect(payment.sellerNetAfterFees).toBe(9_500_000 - 6_500);
    });
  });

  describe('Settlement Calculation', () => {
    it('should calculate actual amounts with SELLER bearing fees', () => {
      const payment = SplitPayment.create(baseProps);
      const actualNetworkFee = 6_500;

      const amounts = payment.calculateActualAmounts(actualNetworkFee);

      expect(amounts.sellerNetReceived).toBe(9_500_000 - 6_500); // Seller pays fee
      expect(amounts.platformNetReceived).toBe(500_000); // Platform gets full fee
      expect(amounts.networkFeeAbsorbedBy).toBe('SELLER');
    });

    it('should handle higher actual fee than estimated', () => {
      const payment = SplitPayment.create(baseProps);
      const actualNetworkFee = 10_000;

      const amounts = payment.calculateActualAmounts(actualNetworkFee);

      expect(amounts.sellerNetReceived).toBe(9_500_000 - 10_000); // Seller absorbs full actual fee
      expect(amounts.platformNetReceived).toBe(500_000);
      expect(amounts.feeVariance).toBe(10_000 - 6_500);
    });
  });

  describe('Akad Disclosure', () => {
    it('should generate disclosure text with SELLER as fee bearer', () => {
      const disclosure = createAkadFeeDisclosure({
        contractId: 'contract-002',
        totalAmount: 10_000_000,
        platformFee: 500_000,
        sellerAmount: 9_500_000,
        mediatorFee: 0,
        networkFeeBearer: NetworkFeeBearer.SELLER,
        estimatedNetworkFee: 6_500,
        currency: 'IDR',
      });

      expect(disclosure.sellerNetAfterFees).toBe(9_500_000 - 6_500);
      expect(disclosure.disclosureText).toContain('PENJUAL');
      expect(disclosure.disclosureText).toContain('dipotong dari pembayaran');
    });
  });
});

describe('Scenario 3: BUYER Bears Network Fees', () => {
  const baseProps: SplitPaymentProps = {
    contractId: 'contract-buyer-test-001',
    totalAmount: 10_000_000,
    currency: 'IDR',
    sellerAmount: 9_500_000,
    platformFee: 500_000,
    mediatorFee: 0,
    sellerAccount: {
      accountNumber: '1234567890123',
      bankCode: 'BSI',
      accountName: 'Seller Test',
    },
    platformAccount: {
      accountNumber: '9876543210123',
      bankCode: 'BSI',
      accountName: 'AMANTRA Revenue',
    },
    networkFeeConfig: {
      bearer: NetworkFeeBearer.BUYER,
      estimatedFee: 6_500,
      currency: 'IDR',
    },
    akadStatementHash: '0x5678901234abcdef5678901234abcdef5678901234abcdef5678901234abcdef',
  };

  describe('Akad Stage (Contract Creation)', () => {
    it('should calculate seller net = full seller amount (BUYER bears fees separately)', () => {
      const sellerNet = calculateSellerNetAfterFees(
        9_500_000,
        6_500,
        NetworkFeeBearer.BUYER
      );

      expect(sellerNet).toBe(9_500_000); // Full amount - buyer pays separately
    });

    it('should create SplitPayment with BUYER as fee bearer', () => {
      const payment = SplitPayment.create(baseProps);

      expect(payment.networkFeeBearer).toBe(NetworkFeeBearer.BUYER);
      expect(payment.sellerNetAfterFees).toBe(9_500_000);
    });
  });

  describe('Settlement Calculation', () => {
    it('should calculate actual amounts with BUYER bearing fees', () => {
      const payment = SplitPayment.create(baseProps);
      const actualNetworkFee = 6_500;

      const amounts = payment.calculateActualAmounts(actualNetworkFee);

      // Both seller and platform receive full amounts
      // Buyer already paid network fee at funding stage
      expect(amounts.sellerNetReceived).toBe(9_500_000);
      expect(amounts.platformNetReceived).toBe(500_000);
      expect(amounts.networkFeeAbsorbedBy).toBe('BUYER');
    });
  });

  describe('Akad Disclosure', () => {
    it('should generate disclosure text with BUYER as fee bearer', () => {
      const disclosure = createAkadFeeDisclosure({
        contractId: 'contract-003',
        totalAmount: 10_000_000,
        platformFee: 500_000,
        sellerAmount: 9_500_000,
        mediatorFee: 0,
        networkFeeBearer: NetworkFeeBearer.BUYER,
        estimatedNetworkFee: 6_500,
        currency: 'IDR',
      });

      expect(disclosure.sellerNetAfterFees).toBe(9_500_000);
      expect(disclosure.disclosureText).toContain('PEMBELI');
      expect(disclosure.disclosureText).toContain('sudah dibayar terpisah');
    });
  });
});

describe('Akad Statement Hash Immutability', () => {
  it('should generate consistent hash for same disclosure', () => {
    const disclosure = createAkadFeeDisclosure({
      contractId: 'contract-hash-test',
      totalAmount: 10_000_000,
      platformFee: 500_000,
      sellerAmount: 9_500_000,
      mediatorFee: 0,
      networkFeeBearer: NetworkFeeBearer.PLATFORM,
      estimatedNetworkFee: 6_500,
      currency: 'IDR',
    });

    const hash1 = hashAkadDisclosure(disclosure);
    const hash2 = hashAkadDisclosure(disclosure);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('should generate different hash for different disclosures', () => {
    const disclosure1 = createAkadFeeDisclosure({
      contractId: 'contract-001',
      totalAmount: 10_000_000,
      platformFee: 500_000,
      sellerAmount: 9_500_000,
      mediatorFee: 0,
      networkFeeBearer: NetworkFeeBearer.PLATFORM,
      estimatedNetworkFee: 6_500,
      currency: 'IDR',
    });

    const disclosure2 = createAkadFeeDisclosure({
      contractId: 'contract-002', // Different contract
      totalAmount: 10_000_000,
      platformFee: 500_000,
      sellerAmount: 9_500_000,
      mediatorFee: 0,
      networkFeeBearer: NetworkFeeBearer.PLATFORM,
      estimatedNetworkFee: 6_500,
      currency: 'IDR',
    });

    const hash1 = hashAkadDisclosure(disclosure1);
    const hash2 = hashAkadDisclosure(disclosure2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('SplitPayment Validation', () => {
  it('should require network fee config', () => {
    const propsWithoutNetworkFee = {
      contractId: 'contract-invalid',
      totalAmount: 10_000_000,
      currency: 'IDR',
      sellerAmount: 9_500_000,
      platformFee: 500_000,
      mediatorFee: 0,
      sellerAccount: {
        accountNumber: '1234567890123',
        bankCode: 'BSI',
        accountName: 'Seller Test',
      },
      platformAccount: {
        accountNumber: '9876543210123',
        bankCode: 'BSI',
        accountName: 'AMANTRA Revenue',
      },
      // Missing networkFeeConfig
      akadStatementHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    } as any;

    expect(() => SplitPayment.create(propsWithoutNetworkFee)).toThrow('Network fee configuration is required');
  });

  it('should require akad statement hash', () => {
    const propsWithoutAkadHash = {
      contractId: 'contract-invalid',
      totalAmount: 10_000_000,
      currency: 'IDR',
      sellerAmount: 9_500_000,
      platformFee: 500_000,
      mediatorFee: 0,
      sellerAccount: {
        accountNumber: '1234567890123',
        bankCode: 'BSI',
        accountName: 'Seller Test',
      },
      platformAccount: {
        accountNumber: '9876543210123',
        bankCode: 'BSI',
        accountName: 'AMANTRA Revenue',
      },
      networkFeeConfig: {
        bearer: NetworkFeeBearer.PLATFORM,
        estimatedFee: 6_500,
        currency: 'IDR',
      },
      akadStatementHash: '', // Empty hash
    };

    expect(() => SplitPayment.create(propsWithoutAkadHash)).toThrow('Akad statement hash is required');
  });

  it('should reject zero hash', () => {
    const propsWithZeroHash = {
      contractId: 'contract-invalid',
      totalAmount: 10_000_000,
      currency: 'IDR',
      sellerAmount: 9_500_000,
      platformFee: 500_000,
      mediatorFee: 0,
      sellerAccount: {
        accountNumber: '1234567890123',
        bankCode: 'BSI',
        accountName: 'Seller Test',
      },
      platformAccount: {
        accountNumber: '9876543210123',
        bankCode: 'BSI',
        accountName: 'AMANTRA Revenue',
      },
      networkFeeConfig: {
        bearer: NetworkFeeBearer.PLATFORM,
        estimatedFee: 6_500,
        currency: 'IDR',
      },
      akadStatementHash: '0x' + '0'.repeat(64), // Zero hash
    };

    expect(() => SplitPayment.create(propsWithZeroHash)).toThrow('Akad statement hash is required');
  });
});

describe('Network Fee Disclosure Text', () => {
  it('should include required ethical statement', () => {
    const disclosure = createAkadFeeDisclosure({
      contractId: 'contract-ethical-test',
      totalAmount: 10_000_000,
      platformFee: 500_000,
      sellerAmount: 9_500_000,
      mediatorFee: 0,
      networkFeeBearer: NetworkFeeBearer.PLATFORM,
      estimatedNetworkFee: 6_500,
      currency: 'IDR',
    });

    // Must contain the ethical statement
    expect(disclosure.disclosureText).toContain('Tidak ada potongan lain selain yang disepakati di akad');
  });

  it('should include seller net amount', () => {
    const disclosure = createAkadFeeDisclosure({
      contractId: 'contract-amount-test',
      totalAmount: 10_000_000,
      platformFee: 500_000,
      sellerAmount: 9_500_000,
      mediatorFee: 0,
      networkFeeBearer: NetworkFeeBearer.SELLER,
      estimatedNetworkFee: 6_500,
      currency: 'IDR',
    });

    // Seller net should be 9,500,000 - 6,500 = 9,493,500
    expect(disclosure.sellerNetAfterFees).toBe(9_493_500);
  });
});

describe('Audit Trail Completeness', () => {
  it('should include all required fields in JSON output', () => {
    const payment = SplitPayment.create({
      contractId: 'contract-audit-test',
      totalAmount: 10_000_000,
      currency: 'IDR',
      sellerAmount: 9_500_000,
      platformFee: 500_000,
      mediatorFee: 0,
      sellerAccount: {
        accountNumber: '1234567890123',
        bankCode: 'BSI',
        accountName: 'Seller Test',
      },
      platformAccount: {
        accountNumber: '9876543210123',
        bankCode: 'BSI',
        accountName: 'AMANTRA Revenue',
      },
      networkFeeConfig: {
        bearer: NetworkFeeBearer.PLATFORM,
        estimatedFee: 6_500,
        currency: 'IDR',
      },
      akadStatementHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    });

    const json = payment.toJSON();

    // Required audit fields
    expect(json).toHaveProperty('networkFeeBearer', 'PLATFORM');
    expect(json).toHaveProperty('estimatedNetworkFee', 6_500);
    expect(json).toHaveProperty('akadStatementHash');
    expect(json).toHaveProperty('sellerNetAfterFees', 9_500_000);
  });

  it('should include network fee details in audit string', () => {
    const payment = SplitPayment.create({
      contractId: 'contract-audit-string-test',
      totalAmount: 10_000_000,
      currency: 'IDR',
      sellerAmount: 9_500_000,
      platformFee: 500_000,
      mediatorFee: 0,
      sellerAccount: {
        accountNumber: '1234567890123',
        bankCode: 'BSI',
        accountName: 'Seller Test',
      },
      platformAccount: {
        accountNumber: '9876543210123',
        bankCode: 'BSI',
        accountName: 'AMANTRA Revenue',
      },
      networkFeeConfig: {
        bearer: NetworkFeeBearer.SELLER,
        estimatedFee: 6_500,
        currency: 'IDR',
      },
      akadStatementHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });

    const auditString = payment.toAuditString();

    expect(auditString).toContain('Network Fee Declaration');
    expect(auditString).toContain('Fee Bearer: SELLER');
    expect(auditString).toContain('Estimated Fee');
    expect(auditString).toContain('Seller Net After Fees');
    expect(auditString).toContain('Akad Statement Hash');
  });
});
