/**
 * AMANTRA - Contract Entity
 *
 * Entitas inti yang merepresentasikan kontrak digital antara pihak-pihak
 * dalam transaksi perdagangan (petani, koperasi, swalayan, distributor, proyek).
 */

import { v4 as uuidv4 } from 'uuid';
import { ContractStatus, ContractStatusTransition } from '../value-objects/ContractStatus';
import { Money } from '../value-objects/Money';
import { FeeStructure } from '../value-objects/FeeStructure';
import { AuditTrail, AuditEntry } from '../value-objects/AuditTrail';
import { DomainEvent } from '../events/DomainEvent';

export interface ContractParty {
  id: string;
  role: 'SELLER' | 'BUYER' | 'MEDIATOR';
  name: string;
  walletAddress?: string;
  bankAccountNumber?: string;
  verifiedAt?: Date;
}

export interface ContractTerms {
  description: string;
  goodsDescription: string;
  quantity: number;
  unit: string;
  unitPrice: Money;
  deliveryDeadline: Date;
  qualityRequirements: string[];
  disputeResolutionDays: number;
}

export interface ContractProps {
  id: string;
  contractNumber: string;
  status: ContractStatus;
  seller: ContractParty;
  buyer: ContractParty;
  mediator?: ContractParty;
  terms: ContractTerms;
  totalAmount: Money;
  feeStructure: FeeStructure;
  escrowAccountId?: string;
  blockchainTxHash?: string;
  blockchainContractId?: string;
  qrisPaymentCode?: string;
  auditTrail: AuditTrail;
  createdAt: Date;
  updatedAt: Date;
  fundedAt?: Date;
  verifiedAt?: Date;
  settledAt?: Date;
  cancelledAt?: Date;
  disputedAt?: Date;
}

export class Contract {
  private props: ContractProps;
  private domainEvents: DomainEvent[] = [];

  private constructor(props: ContractProps) {
    this.props = props;
  }

  // ============================================
  // Factory Methods
  // ============================================

  static create(params: {
    seller: ContractParty;
    buyer: ContractParty;
    mediator?: ContractParty;
    terms: ContractTerms;
    feeStructure: FeeStructure;
    createdBy: string;
  }): Contract {
    const now = new Date();
    const contractNumber = Contract.generateContractNumber();

    const totalAmount = Money.create({
      amount: params.terms.quantity * params.terms.unitPrice.amount,
      currency: params.terms.unitPrice.currency,
    });

    const contract = new Contract({
      id: uuidv4(),
      contractNumber,
      status: ContractStatus.CREATED,
      seller: params.seller,
      buyer: params.buyer,
      mediator: params.mediator,
      terms: params.terms,
      totalAmount,
      feeStructure: params.feeStructure,
      auditTrail: AuditTrail.create(),
      createdAt: now,
      updatedAt: now,
    });

    contract.addAuditEntry({
      action: 'CONTRACT_CREATED',
      performedBy: params.createdBy,
      details: {
        contractNumber,
        seller: params.seller.id,
        buyer: params.buyer.id,
        totalAmount: totalAmount.toString(),
      },
    });

    contract.addDomainEvent({
      type: 'ContractCreated',
      aggregateId: contract.id,
      payload: {
        contractNumber,
        sellerId: params.seller.id,
        buyerId: params.buyer.id,
        totalAmount: totalAmount.toJSON(),
        feeStructure: params.feeStructure.toJSON(),
      },
      occurredAt: now,
    });

    return contract;
  }

  static fromPersistence(props: ContractProps): Contract {
    return new Contract(props);
  }

  private static generateContractNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `AMT-${timestamp}-${random}`;
  }

  // ============================================
  // State Transitions (dengan validasi ketat)
  // ============================================

  /**
   * Transisi ke FUNDED: Dana telah masuk ke escrow via QRIS
   */
  fund(params: {
    escrowAccountId: string;
    qrisPaymentCode: string;
    performedBy: string;
    transactionRef: string;
  }): void {
    this.validateTransition(ContractStatus.FUNDED);

    this.props.status = ContractStatus.FUNDED;
    this.props.escrowAccountId = params.escrowAccountId;
    this.props.qrisPaymentCode = params.qrisPaymentCode;
    this.props.fundedAt = new Date();
    this.props.updatedAt = new Date();

    this.addAuditEntry({
      action: 'CONTRACT_FUNDED',
      performedBy: params.performedBy,
      details: {
        escrowAccountId: params.escrowAccountId,
        transactionRef: params.transactionRef,
        amount: this.props.totalAmount.toString(),
      },
    });

    this.addDomainEvent({
      type: 'ContractFunded',
      aggregateId: this.id,
      payload: {
        escrowAccountId: params.escrowAccountId,
        transactionRef: params.transactionRef,
        amount: this.props.totalAmount.toJSON(),
      },
      occurredAt: new Date(),
    });
  }

  /**
   * Transisi ke VERIFIED: Barang telah diterima dan lulus QC
   */
  verify(params: {
    verifiedBy: string;
    qcNotes: string;
    evidenceUrls: string[];
  }): void {
    this.validateTransition(ContractStatus.VERIFIED);

    this.props.status = ContractStatus.VERIFIED;
    this.props.verifiedAt = new Date();
    this.props.updatedAt = new Date();

    this.addAuditEntry({
      action: 'CONTRACT_VERIFIED',
      performedBy: params.verifiedBy,
      details: {
        qcNotes: params.qcNotes,
        evidenceUrls: params.evidenceUrls,
      },
    });

    this.addDomainEvent({
      type: 'ContractVerified',
      aggregateId: this.id,
      payload: {
        verifiedBy: params.verifiedBy,
        qcNotes: params.qcNotes,
      },
      occurredAt: new Date(),
    });
  }

  /**
   * Transisi ke SETTLED: Dana dicairkan ke seller (otomatis setelah VERIFIED)
   */
  settle(params: {
    blockchainTxHash: string;
    settlementRef: string;
    performedBy: string;
  }): void {
    this.validateTransition(ContractStatus.SETTLED);

    this.props.status = ContractStatus.SETTLED;
    this.props.blockchainTxHash = params.blockchainTxHash;
    this.props.settledAt = new Date();
    this.props.updatedAt = new Date();

    const fees = this.props.feeStructure.calculateFees(this.props.totalAmount);

    this.addAuditEntry({
      action: 'CONTRACT_SETTLED',
      performedBy: params.performedBy,
      details: {
        blockchainTxHash: params.blockchainTxHash,
        settlementRef: params.settlementRef,
        totalAmount: this.props.totalAmount.toString(),
        platformFee: fees.platformFee.toString(),
        mediatorFee: fees.mediatorFee?.toString(),
        netToSeller: fees.netAmount.toString(),
      },
    });

    this.addDomainEvent({
      type: 'ContractSettled',
      aggregateId: this.id,
      payload: {
        blockchainTxHash: params.blockchainTxHash,
        settlementRef: params.settlementRef,
        fees: {
          platformFee: fees.platformFee.toJSON(),
          mediatorFee: fees.mediatorFee?.toJSON(),
          netToSeller: fees.netAmount.toJSON(),
        },
      },
      occurredAt: new Date(),
    });
  }

  /**
   * Transisi ke DISPUTED: Sengketa diajukan
   */
  dispute(params: {
    disputedBy: string;
    reason: string;
    evidenceUrls: string[];
  }): void {
    this.validateTransition(ContractStatus.DISPUTED);

    this.props.status = ContractStatus.DISPUTED;
    this.props.disputedAt = new Date();
    this.props.updatedAt = new Date();

    this.addAuditEntry({
      action: 'CONTRACT_DISPUTED',
      performedBy: params.disputedBy,
      details: {
        reason: params.reason,
        evidenceUrls: params.evidenceUrls,
      },
    });

    this.addDomainEvent({
      type: 'ContractDisputed',
      aggregateId: this.id,
      payload: {
        disputedBy: params.disputedBy,
        reason: params.reason,
      },
      occurredAt: new Date(),
    });
  }

  /**
   * Transisi ke CANCELLED: Kontrak dibatalkan (sebelum FUNDED atau setelah DISPUTED)
   */
  cancel(params: {
    cancelledBy: string;
    reason: string;
    refundRequired: boolean;
  }): void {
    this.validateTransition(ContractStatus.CANCELLED);

    this.props.status = ContractStatus.CANCELLED;
    this.props.cancelledAt = new Date();
    this.props.updatedAt = new Date();

    this.addAuditEntry({
      action: 'CONTRACT_CANCELLED',
      performedBy: params.cancelledBy,
      details: {
        reason: params.reason,
        refundRequired: params.refundRequired,
      },
    });

    this.addDomainEvent({
      type: 'ContractCancelled',
      aggregateId: this.id,
      payload: {
        cancelledBy: params.cancelledBy,
        reason: params.reason,
        refundRequired: params.refundRequired,
      },
      occurredAt: new Date(),
    });
  }

  // ============================================
  // Validation
  // ============================================

  private validateTransition(targetStatus: ContractStatus): void {
    if (!ContractStatusTransition.canTransition(this.props.status, targetStatus)) {
      throw new InvalidStateTransitionError(
        this.props.status,
        targetStatus,
        this.props.contractNumber
      );
    }
  }

  // ============================================
  // Domain Events
  // ============================================

  private addDomainEvent(event: Omit<DomainEvent, 'id' | 'version'>): void {
    this.domainEvents.push({
      ...event,
      id: uuidv4(),
      version: this.domainEvents.length + 1,
    });
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents = [];
    return events;
  }

  // ============================================
  // Audit Trail
  // ============================================

  private addAuditEntry(entry: Omit<AuditEntry, 'timestamp' | 'id'>): void {
    this.props.auditTrail = this.props.auditTrail.addEntry({
      ...entry,
      id: uuidv4(),
      timestamp: new Date(),
    });
  }

  // ============================================
  // Getters (Immutable access)
  // ============================================

  get id(): string {
    return this.props.id;
  }

  get contractNumber(): string {
    return this.props.contractNumber;
  }

  get status(): ContractStatus {
    return this.props.status;
  }

  get seller(): Readonly<ContractParty> {
    return { ...this.props.seller };
  }

  get buyer(): Readonly<ContractParty> {
    return { ...this.props.buyer };
  }

  get mediator(): Readonly<ContractParty> | undefined {
    return this.props.mediator ? { ...this.props.mediator } : undefined;
  }

  get terms(): Readonly<ContractTerms> {
    return { ...this.props.terms };
  }

  get totalAmount(): Money {
    return this.props.totalAmount;
  }

  get feeStructure(): FeeStructure {
    return this.props.feeStructure;
  }

  get escrowAccountId(): string | undefined {
    return this.props.escrowAccountId;
  }

  get blockchainTxHash(): string | undefined {
    return this.props.blockchainTxHash;
  }

  get auditTrail(): AuditTrail {
    return this.props.auditTrail;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // ============================================
  // Serialization
  // ============================================

  toJSON(): ContractProps {
    return { ...this.props };
  }

  toPersistence(): ContractProps {
    return { ...this.props };
  }
}

// ============================================
// Custom Errors
// ============================================

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly fromStatus: ContractStatus,
    public readonly toStatus: ContractStatus,
    public readonly contractNumber: string
  ) {
    super(
      `Invalid state transition from ${fromStatus} to ${toStatus} for contract ${contractNumber}`
    );
    this.name = 'InvalidStateTransitionError';
  }
}
