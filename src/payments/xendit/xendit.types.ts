/**
 * AMANTRA - Xendit QRIS Integration Types
 *
 * Type definitions for Xendit Invoice/QRIS API integration.
 * Based on Xendit API documentation (2024).
 *
 * @see https://developers.xendit.co/api-reference/#create-invoice
 */

// ============================================
// Enums
// ============================================

/**
 * Xendit Invoice Status
 * @see https://developers.xendit.co/api-reference/#invoice-status
 */
export enum XenditInvoiceStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SETTLED = 'SETTLED',
  EXPIRED = 'EXPIRED',
}

/**
 * Xendit Payment Method
 */
export enum XenditPaymentMethod {
  QRIS = 'QRIS',
  BANK_TRANSFER = 'BANK_TRANSFER',
  EWALLET = 'EWALLET',
  RETAIL_OUTLET = 'RETAIL_OUTLET',
  CREDIT_CARD = 'CREDIT_CARD',
}

/**
 * Internal QRIS Invoice Status
 */
export enum QrisInvoiceStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  FUNDED = 'FUNDED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Webhook Processing Result
 */
export enum WebhookProcessingResult {
  SUCCESS = 'SUCCESS',
  DUPLICATE = 'DUPLICATE',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_TIMESTAMP = 'INVALID_TIMESTAMP',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_STATE = 'INVALID_STATE',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================
// Request/Response Types - Xendit API
// ============================================

/**
 * Create Invoice Request to Xendit
 */
export interface XenditCreateInvoiceRequest {
  external_id: string;
  amount: number;
  description: string;
  invoice_duration?: number; // seconds
  customer?: XenditCustomer;
  customer_notification_preference?: XenditNotificationPreference;
  success_redirect_url?: string;
  failure_redirect_url?: string;
  payment_methods?: XenditPaymentMethod[];
  currency?: 'IDR' | 'PHP' | 'THB' | 'VND' | 'MYR';
  callback_virtual_account_id?: string;
  mid_label?: string;
  reminder_time?: number;
  locale?: string;
  items?: XenditInvoiceItem[];
  fees?: XenditInvoiceFee[];
  should_authenticate_credit_card?: boolean;
}

/**
 * Invoice Response from Xendit
 */
export interface XenditInvoiceResponse {
  id: string;
  external_id: string;
  user_id: string;
  status: XenditInvoiceStatus;
  merchant_name: string;
  merchant_profile_picture_url?: string;
  amount: number;
  paid_amount?: number;
  bank_code?: string;
  payer_email?: string;
  description: string;
  expiry_date: string;
  invoice_url: string;
  available_banks?: XenditAvailableBank[];
  available_retail_outlets?: XenditAvailableRetailOutlet[];
  available_ewallets?: XenditAvailableEwallet[];
  available_qr_codes?: XenditAvailableQrCode[];
  available_direct_debits?: XenditAvailableDirectDebit[];
  available_paylaters?: XenditAvailablePaylater[];
  should_exclude_credit_card?: boolean;
  should_send_email?: boolean;
  created: string;
  updated: string;
  currency: string;
  items?: XenditInvoiceItem[];
  fees?: XenditInvoiceFee[];
  fixed_va?: boolean;
  reminder_date?: string;
  paid_at?: string;
  payment_method?: string;
  payment_channel?: string;
  payment_destination?: string;
  payment_id?: string;
  success_redirect_url?: string;
  failure_redirect_url?: string;
}

/**
 * Xendit Webhook Payload for Invoice/QRIS
 */
export interface XenditWebhookPayload {
  id: string;
  external_id: string;
  user_id: string;
  is_high: boolean;
  payment_method: string;
  status: XenditInvoiceStatus;
  merchant_name: string;
  amount: number;
  paid_amount: number;
  bank_code?: string;
  paid_at: string;
  payer_email?: string;
  description: string;
  adjusted_received_amount?: number;
  fees_paid_amount?: number;
  updated: string;
  created: string;
  currency: string;
  payment_channel: string;
  payment_destination?: string;
  payment_id?: string;
  ewallet_type?: string;
  on_demand_link?: string;
  recurring_payment_id?: string;
}

/**
 * QRIS Specific Data from Webhook
 */
export interface XenditQrisPaymentData {
  qr_code_id: string;
  qr_string?: string;
  reference_id: string;
  acquirer_name?: string;
  issuer_name?: string;
}

// ============================================
// Supporting Types
// ============================================

export interface XenditCustomer {
  given_names?: string;
  surname?: string;
  email?: string;
  mobile_number?: string;
  addresses?: XenditAddress[];
}

export interface XenditAddress {
  city?: string;
  country?: string;
  postal_code?: string;
  state?: string;
  street_line1?: string;
  street_line2?: string;
}

export interface XenditNotificationPreference {
  invoice_created?: string[];
  invoice_reminder?: string[];
  invoice_paid?: string[];
}

export interface XenditInvoiceItem {
  name: string;
  quantity: number;
  price: number;
  category?: string;
  url?: string;
}

export interface XenditInvoiceFee {
  type: string;
  value: number;
}

export interface XenditAvailableBank {
  bank_code: string;
  collection_type: string;
  transfer_amount: number;
  bank_branch: string;
  account_holder_name: string;
  identity_amount: number;
}

export interface XenditAvailableRetailOutlet {
  retail_outlet_name: string;
  payment_code: string;
  transfer_amount: number;
}

export interface XenditAvailableEwallet {
  ewallet_type: string;
}

export interface XenditAvailableQrCode {
  qr_code_type: string;
  qr_string?: string;
}

export interface XenditAvailableDirectDebit {
  direct_debit_type: string;
}

export interface XenditAvailablePaylater {
  paylater_type: string;
}

// ============================================
// Internal Domain Types
// ============================================

/**
 * Internal QRIS Invoice Record
 */
export interface QrisInvoice {
  id: string;
  contractId: string;
  xenditInvoiceId: string;
  externalId: string;
  amount: number;
  currency: string;
  status: QrisInvoiceStatus;
  invoiceUrl: string;
  qrString?: string;
  expiryTime: Date;
  paidAt?: Date;
  paidAmount?: number;
  paymentMethod?: string;
  paymentChannel?: string;
  blockchainTxHash?: string;
  blockNumber?: number;
  onChainTimestamp?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Webhook Processing Context
 */
export interface WebhookProcessingContext {
  webhookId: string;
  invoiceId: string;
  externalId: string;
  contractId: string;
  amount: number;
  paidAmount: number;
  paidAt: Date;
  paymentMethod: string;
  paymentChannel: string;
  rawPayload: string;
  signature: string;
  signatureVerified: boolean;
  timestampValidated: boolean;
  idempotencyChecked: boolean;
  processingResult: WebhookProcessingResult;
  errorMessage?: string;
  blockchainTxHash?: string;
  blockNumber?: number;
  processingStartedAt: Date;
  processingCompletedAt?: Date;
}

/**
 * Create QRIS Request (Internal)
 */
export interface CreateQrisRequest {
  contractId: string;
  amount: number;
  description: string;
  buyerEmail?: string;
  buyerName?: string;
  buyerPhone?: string;
  expiryMinutes?: number;
}

/**
 * Create QRIS Response (Internal)
 */
export interface CreateQrisResponse {
  success: boolean;
  invoice?: QrisInvoice;
  invoiceUrl?: string;
  qrString?: string;
  expiryTime?: Date;
  error?: string;
}

/**
 * Webhook Verification Result
 */
export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
  payload?: XenditWebhookPayload;
}

/**
 * Reconciliation Report
 */
export interface ReconciliationReport {
  reportId: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  totalInvoicesChecked: number;
  totalXenditPaid: number;
  totalDbFunded: number;
  totalOnChainFunded: number;
  discrepancies: ReconciliationDiscrepancy[];
  autoRepairAttempts: ReconciliationRepairAttempt[];
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
}

/**
 * Reconciliation Discrepancy
 */
export interface ReconciliationDiscrepancy {
  invoiceId: string;
  contractId: string;
  type: 'XENDIT_PAID_DB_NOT_FUNDED' | 'XENDIT_PAID_CHAIN_NOT_FUNDED' | 'DB_FUNDED_CHAIN_NOT_FUNDED' | 'AMOUNT_MISMATCH' | 'STATUS_MISMATCH';
  xenditStatus?: string;
  dbStatus?: string;
  onChainStatus?: string;
  xenditAmount?: number;
  dbAmount?: number;
  onChainAmount?: number;
  detectedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
}

/**
 * Reconciliation Repair Attempt
 */
export interface ReconciliationRepairAttempt {
  discrepancyId: string;
  invoiceId: string;
  contractId: string;
  repairType: 'RETRY_MARK_FUNDED' | 'UPDATE_DB_STATUS' | 'MANUAL_REVIEW';
  attemptedAt: Date;
  success: boolean;
  txHash?: string;
  error?: string;
}

// ============================================
// Domain Events
// ============================================

export interface QrisInvoiceCreatedEvent {
  type: 'QRIS_INVOICE_CREATED';
  contractId: string;
  invoiceId: string;
  externalId: string;
  amount: number;
  invoiceUrl: string;
  expiryTime: Date;
  timestamp: Date;
}

export interface QrisPaymentReceivedEvent {
  type: 'QRIS_PAYMENT_RECEIVED';
  contractId: string;
  invoiceId: string;
  amount: number;
  paidAmount: number;
  paidAt: Date;
  paymentMethod: string;
  timestamp: Date;
}

export interface QrisPaymentValidatedEvent {
  type: 'QRIS_PAYMENT_VALIDATED';
  contractId: string;
  invoiceId: string;
  validationPassed: boolean;
  validationDetails: {
    signatureValid: boolean;
    timestampValid: boolean;
    amountValid: boolean;
    stateValid: boolean;
    idempotencyValid: boolean;
  };
  timestamp: Date;
}

export interface QrisOnChainFundedEvent {
  type: 'QRIS_ONCHAIN_FUNDED';
  contractId: string;
  invoiceId: string;
  txHash: string;
  blockNumber: number;
  onChainTimestamp: Date;
  gasUsed: string;
  timestamp: Date;
}

export interface QrisRejectedEvent {
  type: 'QRIS_REJECTED';
  contractId: string;
  invoiceId: string;
  reason: WebhookProcessingResult;
  errorMessage: string;
  timestamp: Date;
}

export type QrisDomainEvent =
  | QrisInvoiceCreatedEvent
  | QrisPaymentReceivedEvent
  | QrisPaymentValidatedEvent
  | QrisOnChainFundedEvent
  | QrisRejectedEvent;

// ============================================
// Configuration Types
// ============================================

export interface XenditConfig {
  apiKey: string;
  webhookVerificationToken: string;
  baseUrl: string;
  callbackUrl: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  defaultInvoiceDurationSeconds: number;
  timestampToleranceSeconds: number;
  enableQrisOnly: boolean;
  sandboxMode: boolean;
}

// ============================================
// Error Types
// ============================================

export class XenditApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly rawResponse?: unknown
  ) {
    super(message);
    this.name = 'XenditApiError';
  }
}

export class WebhookValidationError extends Error {
  constructor(
    message: string,
    public readonly reason: WebhookProcessingResult
  ) {
    super(message);
    this.name = 'WebhookValidationError';
  }
}

export class IdempotencyViolationError extends Error {
  constructor(
    public readonly invoiceId: string,
    public readonly previousProcessingId: string
  ) {
    super(`Invoice ${invoiceId} already processed in ${previousProcessingId}`);
    this.name = 'IdempotencyViolationError';
  }
}

export class BlockchainTransactionError extends Error {
  constructor(
    message: string,
    public readonly contractId: string,
    public readonly txHash?: string
  ) {
    super(message);
    this.name = 'BlockchainTransactionError';
  }
}
