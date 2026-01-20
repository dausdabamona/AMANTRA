/**
 * AMANTRA - Domain Events
 *
 * Event-driven architecture untuk memastikan konsistensi
 * antara database, blockchain, dan sistem eksternal.
 */

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  version: number;
}

export type ContractEventType =
  | 'ContractCreated'
  | 'ContractFunded'
  | 'ContractVerified'
  | 'ContractSettled'
  | 'ContractDisputed'
  | 'ContractCancelled';

export type PaymentEventType =
  | 'QRISPaymentInitiated'
  | 'QRISPaymentReceived'
  | 'QRISPaymentFailed'
  | 'EscrowFunded'
  | 'EscrowReleased'
  | 'RefundInitiated'
  | 'RefundCompleted';

export type BlockchainEventType =
  | 'ContractDeployedToChain'
  | 'ContractStateUpdated'
  | 'SettlementRecorded'
  | 'DisputeRecorded';

export interface EventMetadata {
  correlationId: string;
  causationId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface StoredEvent extends DomainEvent {
  metadata: EventMetadata;
  storedAt: Date;
  publishedAt?: Date;
}

/**
 * Interface untuk event handlers
 */
export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
}

/**
 * Interface untuk event publisher
 */
export interface EventPublisher {
  publish(event: DomainEvent, metadata: EventMetadata): Promise<void>;
  publishAll(events: DomainEvent[], metadata: EventMetadata): Promise<void>;
}

/**
 * Interface untuk event store
 */
export interface EventStore {
  append(event: StoredEvent): Promise<void>;
  getEventsByAggregateId(aggregateId: string): Promise<StoredEvent[]>;
  getEventsByType(type: string, fromDate?: Date, toDate?: Date): Promise<StoredEvent[]>;
  getUnpublishedEvents(): Promise<StoredEvent[]>;
  markAsPublished(eventId: string): Promise<void>;
}
