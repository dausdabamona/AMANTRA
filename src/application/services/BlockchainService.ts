/**
 * AMANTRA - Blockchain Service Interface
 *
 * Service untuk interaksi dengan smart contract.
 * Prinsip:
 * - Private key TIDAK pernah ada di frontend
 * - Gunakan KMS/HSM untuk signing
 * - Semua transaksi harus idempotent
 */

export interface RegisterContractParams {
  contractId: string;
  contractNumber: string;
  sellerWallet: string;
  buyerWallet: string;
  mediatorWallet?: string;
  totalAmount: number;
  termsHash: string;
  feeStructure: {
    platformFeeBps: number;
    mediatorFeeBps: number;
    platformFixedFee: number;
    minimumPlatformFee: number;
    maximumPlatformFee: number;
  };
  transactionId: string;
}

export interface RecordFundingParams {
  contractId: string;
  amount: number;
  bankReference: string;
  transactionId: string;
}

export interface RecordVerificationParams {
  contractId: string;
  evidenceHash: string;
  transactionId: string;
}

export interface RecordSettlementParams {
  contractId: string;
  sellerAmount: number;
  platformFee: number;
  mediatorFee: number;
  settlementReference: string;
  transactionId: string;
}

export interface RecordDisputeParams {
  contractId: string;
  disputedBy: string;
  reason: string;
  transactionId: string;
}

export interface RecordCancellationParams {
  contractId: string;
  reason: string;
  refundRequired: boolean;
  transactionId: string;
}

export type ContractStatusOnChain =
  | 'CREATED'
  | 'FUNDED'
  | 'VERIFIED'
  | 'SETTLED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'NOT_FOUND';

export interface BlockchainService {
  /**
   * Mendaftarkan kontrak baru ke blockchain
   * @returns Transaction hash
   */
  registerContract(params: RegisterContractParams): Promise<string>;

  /**
   * Mencatat funding (pembayaran masuk ke escrow)
   * @returns Transaction hash
   */
  recordFunding(params: RecordFundingParams): Promise<string>;

  /**
   * Mencatat verifikasi barang
   * @returns Transaction hash
   */
  recordVerification(params: RecordVerificationParams): Promise<string>;

  /**
   * Mencatat settlement (pencairan)
   * @returns Transaction hash
   */
  recordSettlement(params: RecordSettlementParams): Promise<string>;

  /**
   * Mencatat sengketa
   * @returns Transaction hash
   */
  recordDispute(params: RecordDisputeParams): Promise<string>;

  /**
   * Mencatat pembatalan
   * @returns Transaction hash
   */
  recordCancellation(params: RecordCancellationParams): Promise<string>;

  /**
   * Mendapatkan status kontrak dari blockchain
   */
  getContractStatus(contractId: string): Promise<ContractStatusOnChain>;

  /**
   * Verifikasi apakah transaksi sudah diproses (idempotency check)
   */
  isTransactionProcessed(transactionId: string): Promise<boolean>;

  /**
   * Mendapatkan fee structure dari blockchain (untuk verifikasi)
   */
  getContractFeeStructure(contractId: string): Promise<{
    platformFeeBps: number;
    mediatorFeeBps: number;
  }>;
}
