/**
 * AMANTRA - Escrow Module Index
 *
 * Re-exports all public APIs from the escrow module.
 *
 * @module escrow
 */

// Module
export { EscrowModule, EscrowModuleOptions } from './escrow.module';

// Domain
export {
  SettlementStatus,
  BankTransferStatus,
  EscrowAccountStatus,
  isValidTransition,
  isTerminalStatus,
  isFailureStatus,
  isSafetyBlockedStatus,
  canBeFrozenByDispute,
  isBankTransferInProgress,
  getSafetyStatusDescription,
  SETTLEMENT_TRANSITIONS,
} from './domain/settlement-status.enum';

export {
  SplitPayment,
  SplitPaymentProps,
  SplitPaymentRecipient,
  RecipientType,
} from './domain/split-payment.value';

export {
  EscrowAccount,
  EscrowAccountProps,
  EscrowTransaction,
} from './domain/escrow-account.entity';

export {
  Settlement,
  SettlementProps,
  BankTransferResult,
} from './domain/settlement.entity';

// Ports
export {
  BankEscrowPort,
  CreateEscrowAccountRequest,
  CreateEscrowAccountResponse,
  BalanceResponse,
  FreezeFundsRequest,
  FreezeFundsResponse,
  UnfreezeFundsRequest,
  UnfreezeFundsResponse,
  SplitTransferRequest,
  SplitTransferAck,
  SplitTransferStatus,
  TransferLeg,
  TransferLegStatus,
  BankCallbackPayload,
} from './ports/bank-escrow.port';

export {
  EscrowAccountRepository,
  SettlementRepository,
  EscrowAccountSearchCriteria,
  SettlementSearchCriteria,
  PaginationOptions,
  PaginatedResult,
  SettlementStatistics,
  ESCROW_ACCOUNT_REPOSITORY,
  SETTLEMENT_REPOSITORY,
} from './ports/settlement-repository.port';

// Services
export { EscrowAccountService } from './services/escrow-account.service';
export {
  SettlementOrchestratorService,
  InitiateSettlementRequest,
  SettlementResult,
  SettlementInitiatedEvent,
  SettlementCompletedEvent,
  SettlementFailedEvent,
  SettlementBlockedEvent,
  SettlementFrozenByDisputeEvent,
  EscrowFrozenDueToDisputeEvent,
} from './services/settlement-orchestrator.service';

// Blockchain
export {
  LedgerSyncService,
  OnChainStatus,
  OnChainFeeInfo,
  OnChainContract,
  PayoutInfo,
  MarkSettledResult,
} from './blockchain/ledger-sync.service';

export {
  DisputeListenerService,
  DisputeOpenedEvent,
  DisputeResolvedEvent,
  ProcessedDisputeResult,
  DisputeListenerConfig,
} from './blockchain/dispute-listener.service';

// Jobs
export {
  SettlementReconciliationJob,
  ReconciliationReport,
  ReconciliationSummary,
  Discrepancy,
  DiscrepancyType,
  RepairAttempt,
} from './jobs/settlement-reconciliation.job';

// Adapters
export { MockBankAdapter } from './adapters/mock-bank.adapter';
export { BSIAdapter } from './adapters/bsi.adapter';

// DTOs
export {
  InitiateSettlementDto,
  InitiateSettlementAdvancedDto,
  RecipientAccountDto,
  SettlementRecipientsDto,
  SettlementResponseDto,
  SettlementResultStatus,
  RetrySettlementDto,
  SettlementQueryDto,
  SettlementDetailDto,
  SettlementStatusFilter,
  CreateEscrowAccountDto,
  EscrowAccountDto,
  EscrowAccountQueryDto,
  TriggerReconciliationDto,
  ReconciliationSummaryDto,
} from './dto/initiate-settlement.dto';

export {
  BankCallbackDto,
  BankCallbackStatus,
  TransferLegStatusDto,
  BSICallbackDto,
  MockBankCallbackDto,
  CallbackResponseDto,
  CallbackProcessingResult,
  BankCallbackHeadersDto,
  FullBankCallbackRequestDto,
  CallbackHistoryQueryDto,
  CallbackHistoryEntryDto,
} from './dto/bank-callback.dto';
