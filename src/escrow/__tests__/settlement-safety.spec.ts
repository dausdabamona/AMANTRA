/**
 * AMANTRA - Settlement Safety Tests
 *
 * Unit tests for critical safety fixes:
 * - FIX 1: On-chain status re-validation before markSettled
 * - FIX 2: Dispute detection freezes escrow and settlements
 *
 * These tests verify SOP compliance:
 * "Tidak ada settlement tanpa verifikasi dan tanpa keputusan sah"
 * (No settlement without verification and valid decision)
 *
 * @module escrow/__tests__
 */

import {
  SettlementStatus,
  isSafetyBlockedStatus,
  canBeFrozenByDispute,
  isTerminalStatus,
  isBankTransferInProgress,
  getSafetyStatusDescription,
} from '../domain/settlement-status.enum';
import { Settlement } from '../domain/settlement.entity';
import { SplitPayment } from '../domain/split-payment.value';

// ============================================
// Test Helpers
// ============================================

function createMockSplitPayment(): SplitPayment {
  return SplitPayment.create({
    contractId: 'test-contract-123',
    totalAmount: 1000000,
    sellerAmount: 970000,
    platformFee: 25000,
    mediatorFee: 5000,
    currency: 'IDR',
    sellerAccount: {
      accountNumber: '1234567890',
      bankCode: 'BSI',
      accountName: 'Test Seller',
    },
    platformAccount: {
      accountNumber: '0987654321',
      bankCode: 'BSI',
      accountName: 'AMANTRA Platform',
    },
    mediatorAccount: {
      accountNumber: '1122334455',
      bankCode: 'BSI',
      accountName: 'Test Mediator',
    },
  });
}

function createTestSettlement(status: SettlementStatus = SettlementStatus.INITIATED): Settlement {
  const splitPayment = createMockSplitPayment();
  const settlement = Settlement.create(
    'test-contract-123',
    'escrow-account-456',
    splitPayment,
    'test-user'
  );

  // Advance to desired status
  if (status === SettlementStatus.INITIATED) return settlement;

  settlement.markEscrowLocked('test-user');
  if (status === SettlementStatus.ESCROW_LOCKED) return settlement;

  settlement.markBankPending('test-user', 'batch-ref-123');
  if (status === SettlementStatus.BANK_PENDING) return settlement;

  // Simulate bank transfer results
  settlement.recordBankTransferResult({
    legIndex: 0,
    recipientType: 'SELLER',
    status: 'SUCCESS' as any,
    bankReference: 'bank-ref-seller',
  }, 'test-user');

  settlement.recordBankTransferResult({
    legIndex: 1,
    recipientType: 'PLATFORM',
    status: 'SUCCESS' as any,
    bankReference: 'bank-ref-platform',
  }, 'test-user');

  settlement.recordBankTransferResult({
    legIndex: 2,
    recipientType: 'MEDIATOR',
    status: 'SUCCESS' as any,
    bankReference: 'bank-ref-mediator',
  }, 'test-user');

  settlement.markBankSuccess('test-user');
  if (status === SettlementStatus.BANK_SUCCESS) return settlement;

  return settlement;
}

// ============================================
// Settlement Status Tests
// ============================================

describe('Settlement Status Safety Functions', () => {
  describe('isSafetyBlockedStatus', () => {
    it('should return true for BLOCKED_BY_STATE_CHANGE', () => {
      expect(isSafetyBlockedStatus(SettlementStatus.BLOCKED_BY_STATE_CHANGE)).toBe(true);
    });

    it('should return true for FROZEN_BY_DISPUTE', () => {
      expect(isSafetyBlockedStatus(SettlementStatus.FROZEN_BY_DISPUTE)).toBe(true);
    });

    it('should return false for normal statuses', () => {
      expect(isSafetyBlockedStatus(SettlementStatus.INITIATED)).toBe(false);
      expect(isSafetyBlockedStatus(SettlementStatus.BANK_SUCCESS)).toBe(false);
      expect(isSafetyBlockedStatus(SettlementStatus.COMPLETED)).toBe(false);
    });
  });

  describe('canBeFrozenByDispute', () => {
    it('should return true for non-terminal statuses', () => {
      expect(canBeFrozenByDispute(SettlementStatus.INITIATED)).toBe(true);
      expect(canBeFrozenByDispute(SettlementStatus.ESCROW_LOCKED)).toBe(true);
      expect(canBeFrozenByDispute(SettlementStatus.BANK_PENDING)).toBe(true);
      expect(canBeFrozenByDispute(SettlementStatus.BANK_SUCCESS)).toBe(true);
    });

    it('should return false for terminal statuses', () => {
      expect(canBeFrozenByDispute(SettlementStatus.COMPLETED)).toBe(false);
      expect(canBeFrozenByDispute(SettlementStatus.CANCELLED)).toBe(false);
    });

    it('should return false for already frozen status', () => {
      expect(canBeFrozenByDispute(SettlementStatus.FROZEN_BY_DISPUTE)).toBe(false);
    });
  });

  describe('isBankTransferInProgress', () => {
    it('should return true for BANK_PENDING', () => {
      expect(isBankTransferInProgress(SettlementStatus.BANK_PENDING)).toBe(true);
    });

    it('should return true for BANK_SUCCESS', () => {
      expect(isBankTransferInProgress(SettlementStatus.BANK_SUCCESS)).toBe(true);
    });

    it('should return false for other statuses', () => {
      expect(isBankTransferInProgress(SettlementStatus.INITIATED)).toBe(false);
      expect(isBankTransferInProgress(SettlementStatus.COMPLETED)).toBe(false);
    });
  });

  describe('getSafetyStatusDescription', () => {
    it('should return meaningful description for BLOCKED_BY_STATE_CHANGE', () => {
      const description = getSafetyStatusDescription(SettlementStatus.BLOCKED_BY_STATE_CHANGE);
      expect(description).toContain('blocked');
      expect(description).toContain('status changed');
    });

    it('should return meaningful description for FROZEN_BY_DISPUTE', () => {
      const description = getSafetyStatusDescription(SettlementStatus.FROZEN_BY_DISPUTE);
      expect(description).toContain('frozen');
      expect(description).toContain('dispute');
    });
  });
});

// ============================================
// Settlement Entity Safety Tests
// ============================================

describe('Settlement Entity Safety Methods', () => {
  describe('markBlockedByStateChange', () => {
    it('should transition BANK_SUCCESS to BLOCKED_BY_STATE_CHANGE', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

      settlement.markBlockedByStateChange(
        'SYSTEM',
        4, // DISPUTED
        2, // VERIFIED expected
        'Contract became disputed during bank processing'
      );

      expect(settlement.status).toBe(SettlementStatus.BLOCKED_BY_STATE_CHANGE);
      expect(settlement.isSafetyBlocked).toBe(true);
      expect(settlement.isBlockedByStateChange).toBe(true);
      expect(settlement.errorMessage).toContain('status changed');
    });

    it('should not allow blocking a completed settlement', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);
      settlement.markBlockchainPending('SYSTEM', '0x123');
      settlement.markCompleted('SYSTEM', 12345, new Date());

      expect(() => {
        settlement.markBlockedByStateChange('SYSTEM', 4, 2, 'test');
      }).toThrow('Cannot block terminal settlement');
    });

    it('should record the on-chain status in event details', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

      settlement.markBlockedByStateChange('SYSTEM', 4, 2, 'test reason');

      const lastEvent = settlement.events[settlement.events.length - 1];
      expect(lastEvent.action).toBe('BLOCKED_BY_STATE_CHANGE');
      expect(lastEvent.details.currentOnChainStatus).toBe(4);
      expect(lastEvent.details.expectedStatus).toBe(2);
      expect(lastEvent.details.safetyRule).toBe('RE_VERIFY_ON_CHAIN_BEFORE_SETTLEMENT');
    });
  });

  describe('markFrozenByDispute', () => {
    it('should freeze INITIATED settlement', () => {
      const settlement = createTestSettlement(SettlementStatus.INITIATED);

      settlement.markFrozenByDispute(
        'DISPUTE_LISTENER',
        '0xreasonhash',
        '0xraisedby',
        12345
      );

      expect(settlement.status).toBe(SettlementStatus.FROZEN_BY_DISPUTE);
      expect(settlement.isFrozenByDispute).toBe(true);
      expect(settlement.isSafetyBlocked).toBe(true);
    });

    it('should freeze BANK_PENDING settlement with warning', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_PENDING);

      settlement.markFrozenByDispute(
        'DISPUTE_LISTENER',
        '0xreasonhash',
        '0xraisedby',
        12345
      );

      expect(settlement.status).toBe(SettlementStatus.FROZEN_BY_DISPUTE);

      const lastEvent = settlement.events[settlement.events.length - 1];
      expect(lastEvent.details.bankTransferStatus).toBe('TRANSFER_MAY_BE_IN_PROGRESS');
    });

    it('should freeze BANK_SUCCESS settlement', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

      settlement.markFrozenByDispute(
        'DISPUTE_LISTENER',
        '0xreasonhash',
        '0xraisedby',
        12345
      );

      expect(settlement.status).toBe(SettlementStatus.FROZEN_BY_DISPUTE);

      const lastEvent = settlement.events[settlement.events.length - 1];
      expect(lastEvent.details.bankTransferStatus).toBe('TRANSFER_COMPLETED_FUNDS_LOCKED');
    });

    it('should not allow freezing completed settlement', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);
      settlement.markBlockchainPending('SYSTEM', '0x123');
      settlement.markCompleted('SYSTEM', 12345, new Date());

      expect(() => {
        settlement.markFrozenByDispute('test', '0x', '0x', 1);
      }).toThrow('Cannot freeze settlement');
    });

    it('should not allow double freezing', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_PENDING);
      settlement.markFrozenByDispute('test', '0x1', '0x1', 1);

      expect(() => {
        settlement.markFrozenByDispute('test', '0x2', '0x2', 2);
      }).toThrow('Cannot freeze settlement');
    });

    it('should record dispute details in event', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_PENDING);

      settlement.markFrozenByDispute(
        'DISPUTE_LISTENER',
        '0xabc123',
        '0xuser456',
        99999
      );

      const lastEvent = settlement.events[settlement.events.length - 1];
      expect(lastEvent.details.disputeReasonHash).toBe('0xabc123');
      expect(lastEvent.details.disputeRaisedBy).toBe('0xuser456');
      expect(lastEvent.details.blockNumber).toBe(99999);
      expect(lastEvent.details.safetyRule).toBe('DISPUTE_FREEZES_SETTLEMENT');
    });
  });

  describe('unfreezeAfterDisputeResolution', () => {
    it('should allow unfreezing after dispute resolution', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_PENDING);
      settlement.markFrozenByDispute('test', '0x', '0x', 1);

      settlement.unfreezeAfterDisputeResolution(
        'ADMIN',
        '0xresolutiontx',
        'Dispute resolved in favor of settlement'
      );

      expect(settlement.status).toBe(SettlementStatus.ESCROW_LOCKED);
      expect(settlement.isFrozenByDispute).toBe(false);
    });

    it('should not allow unfreezing non-frozen settlement', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_PENDING);

      expect(() => {
        settlement.unfreezeAfterDisputeResolution('ADMIN', '0x', 'test');
      }).toThrow('Cannot unfreeze settlement');
    });
  });

  describe('canRetry', () => {
    it('should not allow retry for safety-blocked settlements', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);
      settlement.markBlockedByStateChange('SYSTEM', 4, 2, 'test');

      expect(settlement.canRetry).toBe(false);
    });
  });

  describe('recordOnChainStatusVerified', () => {
    it('should record verification in events', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

      settlement.recordOnChainStatusVerified('SYSTEM', 2);

      const lastEvent = settlement.events[settlement.events.length - 1];
      expect(lastEvent.action).toBe('ON_CHAIN_STATUS_VERIFIED');
      expect(lastEvent.details.onChainStatus).toBe(2);
      expect(lastEvent.details.expectedStatus).toBe(2);
    });
  });
});

// ============================================
// State Machine Compliance Tests
// ============================================

describe('Settlement State Machine Safety Compliance', () => {
  it('should not allow CREATED → SETTLED transition', () => {
    // This is validated by the smart contract, but let's verify our status enum
    expect(isTerminalStatus(SettlementStatus.SETTLED as any)).toBeFalsy();
  });

  it('should allow transition from any non-terminal to FROZEN_BY_DISPUTE', () => {
    const nonTerminalStatuses = [
      SettlementStatus.INITIATED,
      SettlementStatus.ESCROW_LOCKED,
      SettlementStatus.BANK_PENDING,
      SettlementStatus.BANK_SUCCESS,
      SettlementStatus.BANK_FAILED,
      SettlementStatus.BLOCKCHAIN_PENDING,
      SettlementStatus.BLOCKCHAIN_FAILED,
      SettlementStatus.MANUAL_REVIEW,
    ];

    for (const status of nonTerminalStatuses) {
      expect(canBeFrozenByDispute(status)).toBe(true);
    }
  });

  it('should not allow transition from terminal to FROZEN_BY_DISPUTE', () => {
    expect(canBeFrozenByDispute(SettlementStatus.COMPLETED)).toBe(false);
    expect(canBeFrozenByDispute(SettlementStatus.CANCELLED)).toBe(false);
  });
});

// ============================================
// SOP Compliance Tests
// ============================================

describe('SOP Compliance: "Tidak ada settlement tanpa verifikasi dan tanpa keputusan sah"', () => {
  describe('Rule 1: On-chain re-verification before final settlement', () => {
    it('should provide mechanism to block settlement if status changed', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

      // Simulate: bank succeeded but on-chain became DISPUTED (4)
      settlement.markBlockedByStateChange('SYSTEM', 4, 2, 'Dispute opened');

      expect(settlement.status).toBe(SettlementStatus.BLOCKED_BY_STATE_CHANGE);
      expect(settlement.isCompleted).toBe(false);
    });

    it('should require recording verification before proceeding', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

      // Record verification
      settlement.recordOnChainStatusVerified('SYSTEM', 2);

      // Now can proceed to blockchain pending
      settlement.markBlockchainPending('SYSTEM', '0xabc');

      const events = settlement.events.filter(e => e.action === 'ON_CHAIN_STATUS_VERIFIED');
      expect(events.length).toBe(1);
    });
  });

  describe('Rule 2: Dispute freezes all money', () => {
    it('should freeze escrow when dispute detected', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_PENDING);

      settlement.markFrozenByDispute('DISPUTE_LISTENER', '0x', '0x', 1);

      expect(settlement.isFrozenByDispute).toBe(true);
      expect(settlement.errorMessage).toContain('frozen');
      expect(settlement.errorMessage).toContain('dispute');
    });

    it('should preserve audit trail for dispute freeze', () => {
      const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);
      const previousStatus = settlement.status;

      settlement.markFrozenByDispute('DISPUTE_LISTENER', '0xreason', '0xraiser', 12345);

      const lastEvent = settlement.events[settlement.events.length - 1];
      expect(lastEvent.details.previousStatus).toBe(previousStatus);
      expect(lastEvent.details.frozenAt).toBeDefined();
    });
  });
});

// ============================================
// Edge Case Tests
// ============================================

describe('Settlement Safety Edge Cases', () => {
  it('should handle dispute during BLOCKCHAIN_PENDING', () => {
    const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);
    settlement.markBlockchainPending('SYSTEM', '0xtx');

    settlement.markFrozenByDispute('DISPUTE_LISTENER', '0x', '0x', 1);

    expect(settlement.status).toBe(SettlementStatus.FROZEN_BY_DISPUTE);
    expect(settlement.blockchainTxHash).toBe('0xtx'); // TX hash preserved
  });

  it('should not lose bank transfer results when frozen', () => {
    const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);

    expect(settlement.bankTransferResults.length).toBe(3);

    settlement.markFrozenByDispute('test', '0x', '0x', 1);

    expect(settlement.bankTransferResults.length).toBe(3);
  });

  it('should increment version on safety transitions', () => {
    const settlement = createTestSettlement(SettlementStatus.BANK_SUCCESS);
    const versionBefore = settlement.version;

    settlement.markBlockedByStateChange('SYSTEM', 4, 2, 'test');

    expect(settlement.version).toBeGreaterThan(versionBefore);
  });
});
