/**
 * AMANTRA - Bank Callback DTOs
 *
 * Data Transfer Objects for handling bank callbacks/webhooks.
 * Supports multiple bank adapters with a generic callback format.
 *
 * @module escrow/dto
 */

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsDateString,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// Bank Callback Status
// ============================================

export enum BankCallbackStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  REVERSED = 'REVERSED',
}

// ============================================
// Generic Bank Callback DTOs
// ============================================

/**
 * Transfer leg status in callback.
 */
export class TransferLegStatusDto {
  @IsString()
  @IsNotEmpty()
  legId: string;

  @IsString()
  @IsNotEmpty()
  recipientType: 'SELLER' | 'PLATFORM' | 'MEDIATOR';

  @IsNumber()
  amount: number;

  @IsEnum(BankCallbackStatus)
  status: BankCallbackStatus;

  @IsOptional()
  @IsString()
  bankReference?: string;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

/**
 * Generic bank callback payload.
 * Can be used with any bank adapter.
 */
export class BankCallbackDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @IsEnum(BankCallbackStatus)
  status: BankCallbackStatus;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLegStatusDto)
  legs?: TransferLegStatusDto[];

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

// ============================================
// BSI-Specific Callback DTOs
// ============================================

/**
 * BSI (Bank Syariah Indonesia) callback structure.
 */
export class BSICallbackDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @IsNotEmpty()
  referenceNumber: string;

  @IsString()
  @IsNotEmpty()
  status: 'SUCCESS' | 'FAILED' | 'PENDING';

  @IsOptional()
  @IsString()
  statusCode?: string;

  @IsOptional()
  @IsString()
  statusDescription?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsArray()
  disbursements?: {
    accountNumber: string;
    amount: number;
    status: string;
    reference: string;
    description?: string;
  }[];

  @IsOptional()
  @IsString()
  processedAt?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}

// ============================================
// Mock Bank Callback DTOs
// ============================================

/**
 * Mock bank callback for testing.
 */
export class MockBankCallbackDto {
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @IsEnum(BankCallbackStatus)
  status: BankCallbackStatus;

  @IsOptional()
  @IsString()
  simulatedError?: string;

  @IsOptional()
  @IsNumber()
  delayMs?: number;
}

// ============================================
// Callback Response DTOs
// ============================================

export enum CallbackProcessingResult {
  SUCCESS = 'SUCCESS',
  DUPLICATE = 'DUPLICATE',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  SETTLEMENT_NOT_FOUND = 'SETTLEMENT_NOT_FOUND',
  INVALID_STATUS = 'INVALID_STATUS',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
}

/**
 * Response after processing a bank callback.
 */
export class CallbackResponseDto {
  @IsEnum(CallbackProcessingResult)
  result: CallbackProcessingResult;

  @IsOptional()
  @IsString()
  settlementId?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  blockchainTxHash?: string;
}

// ============================================
// Callback Verification DTOs
// ============================================

/**
 * Headers from bank callback request.
 */
export class BankCallbackHeadersDto {
  @IsOptional()
  @IsString()
  'x-signature'?: string;

  @IsOptional()
  @IsString()
  'x-timestamp'?: string;

  @IsOptional()
  @IsString()
  'x-request-id'?: string;

  @IsOptional()
  @IsString()
  'x-bank-code'?: string;
}

/**
 * Full callback request with headers and body.
 */
export class FullBankCallbackRequestDto {
  @ValidateNested()
  @Type(() => BankCallbackHeadersDto)
  headers: BankCallbackHeadersDto;

  @ValidateNested()
  @Type(() => BankCallbackDto)
  body: BankCallbackDto;

  @IsOptional()
  @IsString()
  rawBody?: string;
}

// ============================================
// Callback Query DTOs
// ============================================

/**
 * Query parameters for listing callback history.
 */
export class CallbackHistoryQueryDto {
  @IsOptional()
  @IsString()
  settlementId?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsEnum(CallbackProcessingResult)
  result?: CallbackProcessingResult;

  @IsOptional()
  @IsDateString()
  after?: string;

  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 20;
}

/**
 * Callback history entry.
 */
export class CallbackHistoryEntryDto {
  id: string;
  settlementId: string;
  referenceId: string;
  bankCode: string;
  status: BankCallbackStatus;
  processingResult: CallbackProcessingResult;
  receivedAt: Date;
  processedAt: Date;
  rawPayload: Record<string, unknown>;
}
