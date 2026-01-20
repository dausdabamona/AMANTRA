/**
 * AMANTRA - Settlement DTOs
 *
 * Data Transfer Objects for settlement operations.
 * Uses class-validator for runtime validation.
 *
 * @module escrow/dto
 */

import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsArray,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// Initiate Settlement DTOs
// ============================================

/**
 * Request to initiate settlement for a contract.
 */
export class InitiateSettlementDto {
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @IsString()
  @IsNotEmpty()
  performedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Bank account details for settlement recipient.
 */
export class RecipientAccountDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  accountHolderName: string;
}

/**
 * Custom recipient override for settlement.
 * Used when seller/platform accounts need to be specified explicitly.
 */
export class SettlementRecipientsDto {
  @ValidateNested()
  @Type(() => RecipientAccountDto)
  seller: RecipientAccountDto;

  @ValidateNested()
  @Type(() => RecipientAccountDto)
  platform: RecipientAccountDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientAccountDto)
  mediator?: RecipientAccountDto;
}

/**
 * Advanced settlement initiation with custom recipients.
 */
export class InitiateSettlementAdvancedDto extends InitiateSettlementDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementRecipientsDto)
  recipients?: SettlementRecipientsDto;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  expectedVersion?: number;
}

// ============================================
// Settlement Response DTOs
// ============================================

export enum SettlementResultStatus {
  INITIATED = 'INITIATED',
  ALREADY_SETTLED = 'ALREADY_SETTLED',
  INVALID_STATUS = 'INVALID_STATUS',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  BANK_ERROR = 'BANK_ERROR',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
}

/**
 * Response for settlement initiation.
 */
export class SettlementResponseDto {
  @IsEnum(SettlementResultStatus)
  status: SettlementResultStatus;

  @IsOptional()
  @IsString()
  settlementId?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  splitPayment?: {
    totalAmount: number;
    sellerAmount: number;
    platformFee: number;
    mediatorFee: number;
  };
}

// ============================================
// Retry Settlement DTOs
// ============================================

/**
 * Request to retry a failed settlement.
 */
export class RetrySettlementDto {
  @IsString()
  @IsNotEmpty()
  settlementId: string;

  @IsString()
  @IsNotEmpty()
  performedBy: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

// ============================================
// Settlement Query DTOs
// ============================================

export enum SettlementStatusFilter {
  INITIATED = 'INITIATED',
  ESCROW_LOCKED = 'ESCROW_LOCKED',
  BANK_PENDING = 'BANK_PENDING',
  BANK_SUCCESS = 'BANK_SUCCESS',
  BANK_FAILED = 'BANK_FAILED',
  BLOCKCHAIN_PENDING = 'BLOCKCHAIN_PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Query parameters for listing settlements.
 */
export class SettlementQueryDto {
  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsEnum(SettlementStatusFilter, { each: true })
  @IsArray()
  status?: SettlementStatusFilter[];

  @IsOptional()
  @IsDateString()
  initiatedAfter?: string;

  @IsOptional()
  @IsDateString()
  initiatedBefore?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * Settlement details response.
 */
export class SettlementDetailDto {
  id: string;
  contractId: string;
  escrowAccountId: string;
  referenceId: string;
  status: string;
  splitPayment: {
    totalAmount: number;
    sellerAmount: number;
    platformFee: number;
    mediatorFee: number;
    currency: string;
  };
  bankBatchReference?: string;
  blockchainTxHash?: string;
  blockNumber?: number;
  retryCount: number;
  initiatedBy: string;
  initiatedAt: Date;
  completedAt?: Date;
  error?: string;
}

// ============================================
// Escrow Account DTOs
// ============================================

/**
 * Create escrow account request.
 */
export class CreateEscrowAccountDto {
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @IsOptional()
  @IsString()
  currency?: string = 'IDR';

  @IsString()
  @IsNotEmpty()
  performedBy: string;
}

/**
 * Escrow account response.
 */
export class EscrowAccountDto {
  id: string;
  contractId: string;
  bankAccountId: string;
  bankCode: string;
  accountNumber: string;
  balance: number;
  frozenAmount: number;
  availableBalance: number;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Query parameters for listing escrow accounts.
 */
export class EscrowAccountQueryDto {
  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBalance?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ============================================
// Reconciliation DTOs
// ============================================

/**
 * Request for manual reconciliation.
 */
export class TriggerReconciliationDto {
  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}

/**
 * Reconciliation report summary.
 */
export class ReconciliationSummaryDto {
  id: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  totalSettlementsChecked: number;
  discrepancyCount: number;
  repairAttemptCount: number;
  repairSuccessCount: number;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
}
