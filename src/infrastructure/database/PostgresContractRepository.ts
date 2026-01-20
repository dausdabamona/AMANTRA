/**
 * AMANTRA - PostgreSQL Contract Repository
 *
 * Implementasi repository untuk PostgreSQL dengan support untuk:
 * - Event sourcing
 * - Optimistic locking
 * - Audit trail otomatis
 */

import { Pool, PoolClient } from 'pg';
import { Contract, ContractProps, ContractParty, ContractTerms } from '../../domain/entities/Contract';
import {
  ContractRepository,
  ContractSearchCriteria,
  PaginationOptions,
  PaginatedResult,
  ContractStatistics,
} from '../../domain/repositories/ContractRepository';
import { ContractStatus } from '../../domain/value-objects/ContractStatus';
import { Money } from '../../domain/value-objects/Money';
import { FeeStructure } from '../../domain/value-objects/FeeStructure';
import { AuditTrail } from '../../domain/value-objects/AuditTrail';
import { StoredEvent, EventMetadata } from '../../domain/events/DomainEvent';

export class PostgresContractRepository implements ContractRepository {
  constructor(private readonly pool: Pool) {}

  async save(contract: Contract): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const exists = await this.existsById(contract.id, client);

      if (exists) {
        await this.update(contract, client);
      } else {
        await this.insert(contract, client);
      }

      // Store domain events
      const events = contract.pullDomainEvents();
      for (const event of events) {
        await this.storeEvent(event as StoredEvent, client);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insert(contract: Contract, client: PoolClient): Promise<void> {
    const props = contract.toPersistence();

    const query = `
      INSERT INTO contracts (
        id, contract_number, status,
        seller_id, buyer_id, mediator_id,
        description, goods_description, quantity, unit,
        unit_price_amount, unit_price_currency, total_amount,
        delivery_deadline, quality_requirements, dispute_resolution_days,
        platform_fee_bps, mediator_fee_bps, platform_fixed_fee,
        minimum_platform_fee, maximum_platform_fee,
        escrow_account_id, blockchain_tx_hash, blockchain_contract_id, qris_payment_code,
        created_at, updated_at, funded_at, verified_at, settled_at, cancelled_at, disputed_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19,
        $20, $21,
        $22, $23, $24, $25,
        $26, $27, $28, $29, $30, $31, $32
      )
    `;

    const feeStructure = props.feeStructure.toSmartContractFormat();

    await client.query(query, [
      props.id,
      props.contractNumber,
      props.status,
      props.seller.id,
      props.buyer.id,
      props.mediator?.id || null,
      props.terms.description,
      props.terms.goodsDescription,
      props.terms.quantity,
      props.terms.unit,
      props.terms.unitPrice.amount,
      props.terms.unitPrice.currency,
      props.totalAmount.amount,
      props.terms.deliveryDeadline,
      JSON.stringify(props.terms.qualityRequirements),
      props.terms.disputeResolutionDays,
      feeStructure.platformFeeBps,
      feeStructure.mediatorFeeBps,
      feeStructure.platformFixedFee,
      feeStructure.minimumPlatformFee,
      feeStructure.maximumPlatformFee,
      props.escrowAccountId || null,
      props.blockchainTxHash || null,
      props.blockchainContractId || null,
      props.qrisPaymentCode || null,
      props.createdAt,
      props.updatedAt,
      props.fundedAt || null,
      props.verifiedAt || null,
      props.settledAt || null,
      props.cancelledAt || null,
      props.disputedAt || null,
    ]);

    // Store audit trail
    await this.storeAuditTrail(props.id, props.auditTrail, client);
  }

  private async update(contract: Contract, client: PoolClient): Promise<void> {
    const props = contract.toPersistence();

    const query = `
      UPDATE contracts SET
        status = $2,
        escrow_account_id = $3,
        blockchain_tx_hash = $4,
        blockchain_contract_id = $5,
        qris_payment_code = $6,
        updated_at = $7,
        funded_at = $8,
        verified_at = $9,
        settled_at = $10,
        cancelled_at = $11,
        disputed_at = $12
      WHERE id = $1
    `;

    await client.query(query, [
      props.id,
      props.status,
      props.escrowAccountId || null,
      props.blockchainTxHash || null,
      props.blockchainContractId || null,
      props.qrisPaymentCode || null,
      props.updatedAt,
      props.fundedAt || null,
      props.verifiedAt || null,
      props.settledAt || null,
      props.cancelledAt || null,
      props.disputedAt || null,
    ]);

    // Store new audit entries
    await this.storeAuditTrail(props.id, props.auditTrail, client);
  }

  async findById(id: string): Promise<Contract | null> {
    const query = `
      SELECT c.*,
        seller.id as seller_user_id, seller.full_name as seller_name, seller.wallet_address as seller_wallet, seller.bank_account_number as seller_bank,
        buyer.id as buyer_user_id, buyer.full_name as buyer_name, buyer.wallet_address as buyer_wallet, buyer.bank_account_number as buyer_bank,
        mediator.id as mediator_user_id, mediator.full_name as mediator_name, mediator.wallet_address as mediator_wallet
      FROM contracts c
      JOIN users seller ON c.seller_id = seller.id
      JOIN users buyer ON c.buyer_id = buyer.id
      LEFT JOIN users mediator ON c.mediator_id = mediator.id
      WHERE c.id = $1
    `;

    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToContract(result.rows[0]);
  }

  async findByContractNumber(contractNumber: string): Promise<Contract | null> {
    const query = `
      SELECT c.*,
        seller.id as seller_user_id, seller.full_name as seller_name, seller.wallet_address as seller_wallet, seller.bank_account_number as seller_bank,
        buyer.id as buyer_user_id, buyer.full_name as buyer_name, buyer.wallet_address as buyer_wallet, buyer.bank_account_number as buyer_bank,
        mediator.id as mediator_user_id, mediator.full_name as mediator_name, mediator.wallet_address as mediator_wallet
      FROM contracts c
      JOIN users seller ON c.seller_id = seller.id
      JOIN users buyer ON c.buyer_id = buyer.id
      LEFT JOIN users mediator ON c.mediator_id = mediator.id
      WHERE c.contract_number = $1
    `;

    const result = await this.pool.query(query, [contractNumber]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToContract(result.rows[0]);
  }

  async findByCriteria(
    criteria: ContractSearchCriteria,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<Contract>> {
    const { whereClause, params } = this.buildWhereClause(criteria);
    const offset = (pagination.page - 1) * pagination.limit;
    const sortColumn = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';

    const countQuery = `
      SELECT COUNT(*) as total FROM contracts c ${whereClause}
    `;

    const dataQuery = `
      SELECT c.*,
        seller.id as seller_user_id, seller.full_name as seller_name, seller.wallet_address as seller_wallet, seller.bank_account_number as seller_bank,
        buyer.id as buyer_user_id, buyer.full_name as buyer_name, buyer.wallet_address as buyer_wallet, buyer.bank_account_number as buyer_bank,
        mediator.id as mediator_user_id, mediator.full_name as mediator_name, mediator.wallet_address as mediator_wallet
      FROM contracts c
      JOIN users seller ON c.seller_id = seller.id
      JOIN users buyer ON c.buyer_id = buyer.id
      LEFT JOIN users mediator ON c.mediator_id = mediator.id
      ${whereClause}
      ORDER BY c.${sortColumn} ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(countQuery, params),
      this.pool.query(dataQuery, [...params, pagination.limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const contracts = await Promise.all(dataResult.rows.map(row => this.mapRowToContract(row)));

    return {
      data: contracts,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async findBySellerId(sellerId: string, pagination: PaginationOptions): Promise<PaginatedResult<Contract>> {
    return this.findByCriteria({ sellerId }, pagination);
  }

  async findByBuyerId(buyerId: string, pagination: PaginationOptions): Promise<PaginatedResult<Contract>> {
    return this.findByCriteria({ buyerId }, pagination);
  }

  async findActiveContracts(pagination: PaginationOptions): Promise<PaginatedResult<Contract>> {
    return this.findByCriteria(
      { status: [ContractStatus.CREATED, ContractStatus.FUNDED, ContractStatus.VERIFIED, ContractStatus.DISPUTED] },
      pagination
    );
  }

  async findOverdueContracts(): Promise<Contract[]> {
    const query = `
      SELECT c.*,
        seller.id as seller_user_id, seller.full_name as seller_name, seller.wallet_address as seller_wallet, seller.bank_account_number as seller_bank,
        buyer.id as buyer_user_id, buyer.full_name as buyer_name, buyer.wallet_address as buyer_wallet, buyer.bank_account_number as buyer_bank,
        mediator.id as mediator_user_id, mediator.full_name as mediator_name, mediator.wallet_address as mediator_wallet
      FROM contracts c
      JOIN users seller ON c.seller_id = seller.id
      JOIN users buyer ON c.buyer_id = buyer.id
      LEFT JOIN users mediator ON c.mediator_id = mediator.id
      WHERE c.status IN ('FUNDED', 'VERIFIED')
        AND c.delivery_deadline < NOW()
    `;

    const result = await this.pool.query(query);
    return Promise.all(result.rows.map(row => this.mapRowToContract(row)));
  }

  async countByStatus(status: ContractStatus): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM contracts WHERE status = $1',
      [status]
    );
    return parseInt(result.rows[0].count, 10);
  }

  async getStatistics(fromDate: Date, toDate: Date): Promise<ContractStatistics> {
    const query = `
      SELECT
        COUNT(*) as total_contracts,
        COUNT(*) FILTER (WHERE status = 'CREATED') as created_count,
        COUNT(*) FILTER (WHERE status = 'FUNDED') as funded_count,
        COUNT(*) FILTER (WHERE status = 'VERIFIED') as verified_count,
        COUNT(*) FILTER (WHERE status = 'SETTLED') as settled_count,
        COUNT(*) FILTER (WHERE status = 'DISPUTED') as disputed_count,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_count,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'SETTLED'), 0) as settled_value,
        COALESCE(AVG(EXTRACT(EPOCH FROM (settled_at - created_at)) / 3600) FILTER (WHERE status = 'SETTLED'), 0) as avg_settlement_hours
      FROM contracts
      WHERE created_at >= $1 AND created_at <= $2
    `;

    const result = await this.pool.query(query, [fromDate, toDate]);
    const row = result.rows[0];

    return {
      totalContracts: parseInt(row.total_contracts, 10),
      byStatus: {
        [ContractStatus.CREATED]: parseInt(row.created_count, 10),
        [ContractStatus.FUNDED]: parseInt(row.funded_count, 10),
        [ContractStatus.VERIFIED]: parseInt(row.verified_count, 10),
        [ContractStatus.SETTLED]: parseInt(row.settled_count, 10),
        [ContractStatus.DISPUTED]: parseInt(row.disputed_count, 10),
        [ContractStatus.CANCELLED]: parseInt(row.cancelled_count, 10),
      },
      totalValue: parseInt(row.total_value, 10),
      settledValue: parseInt(row.settled_value, 10),
      disputedCount: parseInt(row.disputed_count, 10),
      averageSettlementTime: parseFloat(row.avg_settlement_hours),
    };
  }

  async lockForUpdate(id: string): Promise<Contract | null> {
    const query = `
      SELECT c.*,
        seller.id as seller_user_id, seller.full_name as seller_name, seller.wallet_address as seller_wallet, seller.bank_account_number as seller_bank,
        buyer.id as buyer_user_id, buyer.full_name as buyer_name, buyer.wallet_address as buyer_wallet, buyer.bank_account_number as buyer_bank,
        mediator.id as mediator_user_id, mediator.full_name as mediator_name, mediator.wallet_address as mediator_wallet
      FROM contracts c
      JOIN users seller ON c.seller_id = seller.id
      JOIN users buyer ON c.buyer_id = buyer.id
      LEFT JOIN users mediator ON c.mediator_id = mediator.id
      WHERE c.id = $1
      FOR UPDATE OF c
    `;

    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToContract(result.rows[0]);
  }

  async existsByContractNumber(contractNumber: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT EXISTS(SELECT 1 FROM contracts WHERE contract_number = $1) as exists',
      [contractNumber]
    );
    return result.rows[0].exists;
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async existsById(id: string, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      'SELECT EXISTS(SELECT 1 FROM contracts WHERE id = $1) as exists',
      [id]
    );
    return result.rows[0].exists;
  }

  private buildWhereClause(criteria: ContractSearchCriteria): { whereClause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (criteria.status) {
      if (Array.isArray(criteria.status)) {
        conditions.push(`c.status = ANY($${params.length + 1})`);
        params.push(criteria.status);
      } else {
        conditions.push(`c.status = $${params.length + 1}`);
        params.push(criteria.status);
      }
    }

    if (criteria.sellerId) {
      conditions.push(`c.seller_id = $${params.length + 1}`);
      params.push(criteria.sellerId);
    }

    if (criteria.buyerId) {
      conditions.push(`c.buyer_id = $${params.length + 1}`);
      params.push(criteria.buyerId);
    }

    if (criteria.mediatorId) {
      conditions.push(`c.mediator_id = $${params.length + 1}`);
      params.push(criteria.mediatorId);
    }

    if (criteria.contractNumber) {
      conditions.push(`c.contract_number ILIKE $${params.length + 1}`);
      params.push(`%${criteria.contractNumber}%`);
    }

    if (criteria.createdFrom) {
      conditions.push(`c.created_at >= $${params.length + 1}`);
      params.push(criteria.createdFrom);
    }

    if (criteria.createdTo) {
      conditions.push(`c.created_at <= $${params.length + 1}`);
      params.push(criteria.createdTo);
    }

    if (criteria.minAmount) {
      conditions.push(`c.total_amount >= $${params.length + 1}`);
      params.push(criteria.minAmount);
    }

    if (criteria.maxAmount) {
      conditions.push(`c.total_amount <= $${params.length + 1}`);
      params.push(criteria.maxAmount);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { whereClause, params };
  }

  private async mapRowToContract(row: Record<string, unknown>): Promise<Contract> {
    const auditTrail = await this.loadAuditTrail(row.id as string);

    const seller: ContractParty = {
      id: row.seller_user_id as string,
      role: 'SELLER',
      name: row.seller_name as string,
      walletAddress: row.seller_wallet as string | undefined,
      bankAccountNumber: row.seller_bank as string | undefined,
    };

    const buyer: ContractParty = {
      id: row.buyer_user_id as string,
      role: 'BUYER',
      name: row.buyer_name as string,
      walletAddress: row.buyer_wallet as string | undefined,
      bankAccountNumber: row.buyer_bank as string | undefined,
    };

    const mediator: ContractParty | undefined = row.mediator_user_id
      ? {
          id: row.mediator_user_id as string,
          role: 'MEDIATOR',
          name: row.mediator_name as string,
          walletAddress: row.mediator_wallet as string | undefined,
        }
      : undefined;

    const terms: ContractTerms = {
      description: row.description as string,
      goodsDescription: row.goods_description as string,
      quantity: parseFloat(row.quantity as string),
      unit: row.unit as string,
      unitPrice: Money.create({
        amount: parseInt(row.unit_price_amount as string, 10),
        currency: row.unit_price_currency as 'IDR' | 'USD',
      }),
      deliveryDeadline: new Date(row.delivery_deadline as string),
      qualityRequirements: row.quality_requirements as string[],
      disputeResolutionDays: row.dispute_resolution_days as number,
    };

    const feeStructure = FeeStructure.create({
      platformFeeBps: row.platform_fee_bps as number,
      mediatorFeeBps: row.mediator_fee_bps as number || undefined,
      platformFixedFee: row.platform_fixed_fee
        ? Money.fromIDR(row.platform_fixed_fee as number)
        : undefined,
      minimumPlatformFee: row.minimum_platform_fee
        ? Money.fromIDR(row.minimum_platform_fee as number)
        : undefined,
      maximumPlatformFee: row.maximum_platform_fee
        ? Money.fromIDR(row.maximum_platform_fee as number)
        : undefined,
    });

    const props: ContractProps = {
      id: row.id as string,
      contractNumber: row.contract_number as string,
      status: row.status as ContractStatus,
      seller,
      buyer,
      mediator,
      terms,
      totalAmount: Money.create({
        amount: parseInt(row.total_amount as string, 10),
        currency: row.unit_price_currency as 'IDR' | 'USD',
      }),
      feeStructure,
      escrowAccountId: row.escrow_account_id as string | undefined,
      blockchainTxHash: row.blockchain_tx_hash as string | undefined,
      blockchainContractId: row.blockchain_contract_id as string | undefined,
      qrisPaymentCode: row.qris_payment_code as string | undefined,
      auditTrail,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      fundedAt: row.funded_at ? new Date(row.funded_at as string) : undefined,
      verifiedAt: row.verified_at ? new Date(row.verified_at as string) : undefined,
      settledAt: row.settled_at ? new Date(row.settled_at as string) : undefined,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at as string) : undefined,
      disputedAt: row.disputed_at ? new Date(row.disputed_at as string) : undefined,
    };

    return Contract.fromPersistence(props);
  }

  private async loadAuditTrail(contractId: string): Promise<AuditTrail> {
    const result = await this.pool.query(
      `SELECT * FROM audit_logs WHERE entity_type = 'Contract' AND entity_id = $1 ORDER BY created_at ASC`,
      [contractId]
    );

    const entries = result.rows.map(row => ({
      id: row.id,
      timestamp: new Date(row.created_at),
      action: row.action,
      performedBy: row.performed_by,
      details: row.new_values || {},
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    }));

    return AuditTrail.fromEntries(entries);
  }

  private async storeAuditTrail(contractId: string, auditTrail: AuditTrail, client: PoolClient): Promise<void> {
    const entries = auditTrail.getEntries();
    const lastEntry = entries[entries.length - 1];

    if (!lastEntry) return;

    // Only insert the latest entry (others should already be stored)
    const existsResult = await client.query(
      'SELECT EXISTS(SELECT 1 FROM audit_logs WHERE id = $1) as exists',
      [lastEntry.id]
    );

    if (!existsResult.rows[0].exists) {
      await client.query(
        `INSERT INTO audit_logs (id, entity_type, entity_id, action, performed_by, new_values, ip_address, user_agent, created_at)
         VALUES ($1, 'Contract', $2, $3, $4, $5, $6, $7, $8)`,
        [
          lastEntry.id,
          contractId,
          lastEntry.action,
          lastEntry.performedBy,
          JSON.stringify(lastEntry.details),
          lastEntry.ipAddress || null,
          lastEntry.userAgent || null,
          lastEntry.timestamp,
        ]
      );
    }
  }

  private async storeEvent(event: StoredEvent, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO domain_events (id, aggregate_id, aggregate_type, event_type, version, payload, metadata, occurred_at)
       VALUES ($1, $2, 'Contract', $3, $4, $5, $6, $7)`,
      [
        event.id,
        event.aggregateId,
        event.type,
        event.version,
        JSON.stringify(event.payload),
        JSON.stringify(event.metadata || {}),
        event.occurredAt,
      ]
    );

    // Also insert into outbox for reliable publishing
    await client.query(
      `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('Contract', $1, $2, $3)`,
      [event.aggregateId, event.type, JSON.stringify(event.payload)]
    );
  }
}
