# AMANTRA - Payment Flow Documentation

## QRIS to Blockchain Anchoring Flow

### Overview

AMANTRA menggunakan model **Hybrid Custodial Syariah** di mana:
- Dana dikelola **off-chain** di rekening escrow PT
- Blockchain hanya menyimpan **hash bukti** transaksi sebagai notaris digital
- User tidak perlu memiliki wallet crypto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        QRIS TO BLOCKCHAIN FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │  Buyer   │───▶│   QRIS   │───▶│  Xendit  │───▶│  Backend │───▶│  DB    │ │
│  │  (User)  │    │  Scan    │    │  Server  │    │  NestJS  │    │ Supabase│ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│                                         │               │                    │
│                                         │               ▼                    │
│                                         │        ┌──────────────┐            │
│                                  Webhook│        │  Blockchain  │            │
│                                         │        │   Anchoring  │            │
│                                         │        │   Service    │            │
│                                         ▼        └──────────────┘            │
│                                  ┌──────────────┐        │                   │
│                                  │   Webhook    │        ▼                   │
│                                  │   Handler    │  ┌──────────────┐          │
│                                  └──────────────┘  │   Polygon    │          │
│                                                    │   Network    │          │
│                                                    └──────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Akad Creation & Funding Request

### 1.1 Create Akad (Contract)

```
User (Buyer) → POST /akad → Backend
```

**Sequence:**
1. Buyer creates akad with seller details
2. Backend validates akad data
3. Backend stores akad in database with status `DRAFT`
4. Backend returns akad ID

**Database State:**
```sql
INSERT INTO akad (
  id, buyer_id, seller_id, title, total_amount, status
) VALUES (
  'uuid', 'buyer-uuid', 'seller-uuid', 'Renovasi Rumah', 50000000, 'DRAFT'
);
```

### 1.2 Submit for Approval

```
Buyer → POST /akad/:id/submit → Backend → Notify Seller
```

**Sequence:**
1. Buyer submits akad
2. Backend validates all fields
3. Status changes to `PENDING_APPROVAL`
4. Send notification to seller (WhatsApp/SMS/Email)

### 1.3 Seller Approves

```
Seller → POST /akad/:id/approve → Backend → Ready for Payment
```

**Sequence:**
1. Seller reviews and approves
2. Backend validates approval
3. Status changes to `APPROVED`
4. Compute akad hash
5. Ready for buyer payment

---

## Phase 2: QRIS Payment Processing

### 2.1 Create Payment Invoice

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT CREATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Buyer App                Backend                 Xendit API                 │
│     │                        │                        │                      │
│     │  POST /payment/create  │                        │                      │
│     │───────────────────────▶│                        │                      │
│     │                        │                        │                      │
│     │                        │  Create Invoice        │                      │
│     │                        │───────────────────────▶│                      │
│     │                        │                        │                      │
│     │                        │  Invoice + QR Code     │                      │
│     │                        │◀───────────────────────│                      │
│     │                        │                        │                      │
│     │  Payment URL + QR      │                        │                      │
│     │◀───────────────────────│                        │                      │
│     │                        │                        │                      │
│     │  Display QR to User    │                        │                      │
│     │                        │                        │                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Request to Backend:**
```json
POST /payment/create
{
  "akad_id": "akad-uuid",
  "method": "qris",
  "payer_email": "buyer@email.com",
  "payer_phone": "+6281234567890"
}
```

**Backend to Xendit:**
```javascript
// payment.service.ts
async createQRISPayment(akadId: string, payerInfo: PayerInfo) {
  const akad = await this.akadService.findById(akadId);

  // Calculate total with platform fee (2.5%)
  const platformFee = akad.total_amount * 0.025;
  const totalAmount = akad.total_amount + platformFee;

  // Create Xendit invoice
  const invoice = await this.xenditClient.invoice.create({
    externalId: `AMT-${akad.contract_number}-${Date.now()}`,
    amount: totalAmount,
    payerEmail: payerInfo.email,
    description: `Pembayaran Akad: ${akad.title}`,
    invoiceDuration: 3600, // 1 hour expiry
    paymentMethods: ['QRIS'],
    currency: 'IDR',
    reminderTime: 1,
    successRedirectUrl: `${this.config.frontendUrl}/akad/${akadId}/success`,
    failureRedirectUrl: `${this.config.frontendUrl}/akad/${akadId}/failed`,
    items: [
      {
        name: akad.title,
        quantity: 1,
        price: akad.total_amount,
      },
      {
        name: 'Platform Fee (2.5%)',
        quantity: 1,
        price: platformFee,
      }
    ],
    metadata: {
      akad_id: akadId,
      buyer_id: akad.buyer_id,
      seller_id: akad.seller_id,
    }
  });

  // Store payment record
  const payment = await this.prisma.payment.create({
    data: {
      id: uuidv4(),
      akad_id: akadId,
      xendit_invoice_id: invoice.id,
      external_id: invoice.externalId,
      amount: totalAmount,
      platform_fee: platformFee,
      method: 'QRIS',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 3600000),
      qr_code_url: invoice.qrCodeUrl,
      payment_url: invoice.invoiceUrl,
    }
  });

  return {
    id: payment.id,
    amount: totalAmount,
    breakdown: {
      akad_amount: akad.total_amount,
      platform_fee: platformFee,
    },
    qr_code_url: invoice.qrCodeUrl,
    payment_url: invoice.invoiceUrl,
    expires_at: payment.expires_at,
  };
}
```

**Response to Buyer:**
```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "amount": 51250000,
    "breakdown": {
      "akad_amount": 50000000,
      "platform_fee": 1250000
    },
    "method": "qris",
    "qr_code_url": "https://qris.xendit.co/qr/xxxx",
    "payment_url": "https://checkout.xendit.co/web/xxxx",
    "expires_at": "2024-01-01T01:00:00Z"
  }
}
```

### 2.2 Buyer Scans QRIS

```
Buyer → Opens Banking App → Scan QR → Confirm Payment → Bank Processes
```

**User Experience:**
1. Buyer sees QR code on AMANTRA app
2. Opens GoPay/OVO/Dana/Bank app
3. Scans QR code
4. Confirms payment amount (Rp 51.250.000)
5. Enters PIN
6. Payment processed

---

## Phase 3: Webhook Processing & Blockchain Anchoring

### 3.1 Xendit Webhook Reception

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WEBHOOK PROCESSING FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Xendit                  Backend                  Database                   │
│     │                        │                        │                      │
│     │  POST /webhook/xendit  │                        │                      │
│     │───────────────────────▶│                        │                      │
│     │                        │                        │                      │
│     │                        │  Verify Signature      │                      │
│     │                        │  (X-Callback-Token)    │                      │
│     │                        │                        │                      │
│     │                        │  Update Payment        │                      │
│     │                        │───────────────────────▶│                      │
│     │                        │                        │                      │
│     │                        │  Update Akad Status    │                      │
│     │                        │───────────────────────▶│                      │
│     │                        │                        │                      │
│     │  HTTP 200 OK           │                        │                      │
│     │◀───────────────────────│                        │                      │
│     │                        │                        │                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Webhook Payload from Xendit:**
```json
{
  "id": "579c8d61f23fa4ca35e52da4",
  "external_id": "AMT-20240101-000001-1704067200000",
  "user_id": "5781d19b2e2385880609791c",
  "status": "PAID",
  "paid_amount": 51250000,
  "paid_at": "2024-01-01T00:30:00.000Z",
  "payer_email": "buyer@email.com",
  "description": "Pembayaran Akad: Renovasi Rumah",
  "payment_method": "QR_CODE",
  "payment_channel": "QRIS",
  "payment_destination": "QRIS",
  "currency": "IDR",
  "metadata": {
    "akad_id": "akad-uuid",
    "buyer_id": "buyer-uuid",
    "seller_id": "seller-uuid"
  }
}
```

**Webhook Handler:**
```typescript
// webhook.controller.ts
@Post('webhook/xendit')
async handleXenditWebhook(
  @Headers('x-callback-token') callbackToken: string,
  @Body() payload: XenditWebhookPayload,
  @Res() res: Response
) {
  // 1. Verify callback token
  if (callbackToken !== this.config.xenditCallbackToken) {
    this.logger.warn('Invalid callback token received');
    return res.status(401).json({ error: 'Invalid callback token' });
  }

  // 2. Idempotency check - prevent duplicate processing
  const existingPayment = await this.paymentService.findByXenditId(payload.id);
  if (existingPayment?.status === 'PAID') {
    return res.status(200).json({ message: 'Already processed' });
  }

  try {
    // 3. Process payment based on status
    if (payload.status === 'PAID') {
      await this.paymentService.handlePaymentSuccess(payload);
    } else if (payload.status === 'EXPIRED') {
      await this.paymentService.handlePaymentExpired(payload);
    } else if (payload.status === 'FAILED') {
      await this.paymentService.handlePaymentFailed(payload);
    }

    return res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    this.logger.error('Webhook processing error', error);
    // Return 200 to prevent Xendit retry, handle internally
    return res.status(200).json({ message: 'Error logged' });
  }
}
```

### 3.2 Payment Success Processing

```typescript
// payment.service.ts
async handlePaymentSuccess(payload: XenditWebhookPayload) {
  const akadId = payload.metadata.akad_id;

  return await this.prisma.$transaction(async (tx) => {
    // 1. Update payment record
    const payment = await tx.payment.update({
      where: { xendit_invoice_id: payload.id },
      data: {
        status: 'PAID',
        paid_at: new Date(payload.paid_at),
        paid_amount: payload.paid_amount,
        payment_method: payload.payment_method,
        payment_channel: payload.payment_channel,
        xendit_payment_id: payload.id,
      }
    });

    // 2. Update akad status to FUNDED
    const akad = await tx.akad.update({
      where: { id: akadId },
      data: {
        status: 'FUNDED',
        funded_at: new Date(),
      }
    });

    // 3. Create audit trail
    await tx.auditTrail.create({
      data: {
        id: uuidv4(),
        akad_id: akadId,
        action: 'PAYMENT_RECEIVED',
        actor_id: akad.buyer_id,
        actor_type: 'USER',
        details: {
          payment_id: payment.id,
          amount: payment.paid_amount,
          method: payment.payment_method,
        },
        ip_address: null, // From webhook
      }
    });

    // 4. Queue blockchain anchoring (async)
    await this.blockchainQueue.add('anchor-payment', {
      akadId,
      paymentId: payment.id,
      amount: payment.paid_amount,
      paidAt: payment.paid_at,
    });

    // 5. Send notifications
    await this.notificationService.sendPaymentConfirmation(akad, payment);

    return payment;
  });
}
```

### 3.3 Blockchain Anchoring

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN ANCHORING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Backend Queue           Blockchain Service           Polygon Network        │
│       │                        │                           │                 │
│       │  Process Job           │                           │                 │
│       │───────────────────────▶│                           │                 │
│       │                        │                           │                 │
│       │                        │  Compute Hash             │                 │
│       │                        │  (akad + payment data)    │                 │
│       │                        │                           │                 │
│       │                        │  Sign Transaction         │                 │
│       │                        │  (HSM/KMS)                │                 │
│       │                        │                           │                 │
│       │                        │  confirmPayment()         │                 │
│       │                        │──────────────────────────▶│                 │
│       │                        │                           │                 │
│       │                        │  Transaction Hash         │                 │
│       │                        │◀──────────────────────────│                 │
│       │                        │                           │                 │
│       │  Update DB with        │                           │                 │
│       │  tx_hash               │                           │                 │
│       │◀───────────────────────│                           │                 │
│       │                        │                           │                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Blockchain Anchoring Service:**
```typescript
// blockchain-anchoring.service.ts
@Processor('blockchain')
export class BlockchainAnchoringProcessor {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly prisma: PrismaService,
  ) {}

  @Process('anchor-payment')
  async anchorPayment(job: Job<AnchorPaymentJob>) {
    const { akadId, paymentId, amount, paidAt } = job.data;

    // 1. Get akad data
    const akad = await this.prisma.akad.findUnique({
      where: { id: akadId },
      include: { milestones: true }
    });

    // 2. Compute payment confirmation hash
    const paymentData = {
      akadId,
      contractNumber: akad.contract_number,
      amount,
      paidAt: paidAt.toISOString(),
      buyerId: akad.buyer_id,
      sellerId: akad.seller_id,
    };
    const paymentHash = this.computeHash(paymentData);

    // 3. Call smart contract
    const txHash = await this.blockchainService.confirmPayment(
      akad.contract_number,
      paymentHash,
      amount
    );

    // 4. Store blockchain anchor
    await this.prisma.blockchainAnchor.create({
      data: {
        id: uuidv4(),
        akad_id: akadId,
        event_type: 'PAYMENT_CONFIRMED',
        data_hash: paymentHash,
        tx_hash: txHash,
        network: 'polygon',
        block_number: await this.blockchainService.getBlockNumber(txHash),
        status: 'CONFIRMED',
      }
    });

    // 5. Update akad with blockchain info
    await this.prisma.akad.update({
      where: { id: akadId },
      data: {
        blockchain_status: 'ANCHORED',
        blockchain_tx_hash: txHash,
      }
    });

    this.logger.log(`Payment anchored: ${txHash}`);
  }

  private computeHash(data: any): string {
    return ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(data))
    );
  }
}
```

**Smart Contract Interaction:**
```typescript
// blockchain.service.ts
@Injectable()
export class BlockchainService {
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;

  constructor(private config: ConfigService) {
    const provider = new ethers.JsonRpcProvider(
      this.config.get('POLYGON_RPC_URL')
    );

    // Load operator wallet from HSM/KMS
    this.wallet = new ethers.Wallet(
      this.config.get('OPERATOR_PRIVATE_KEY'),
      provider
    );

    this.contract = new ethers.Contract(
      this.config.get('AMANTRA_CONTRACT_ADDRESS'),
      AmantraLedgerV6ABI,
      this.wallet
    );
  }

  async confirmPayment(
    contractNumber: string,
    paymentHash: string,
    amount: bigint
  ): Promise<string> {
    // Gas estimation
    const gasEstimate = await this.contract.confirmPayment.estimateGas(
      contractNumber,
      paymentHash,
      amount
    );

    // Submit transaction
    const tx = await this.contract.confirmPayment(
      contractNumber,
      paymentHash,
      amount,
      {
        gasLimit: gasEstimate * 120n / 100n, // 20% buffer
      }
    );

    // Wait for confirmation
    const receipt = await tx.wait(2); // 2 block confirmations

    return receipt.hash;
  }
}
```

---

## Phase 4: Fund Management (Off-Chain)

### 4.1 Escrow Account Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OFF-CHAIN FUND MANAGEMENT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     PT AMANTRA TEKNOLOGI INDONESIA                    │   │
│  │                                                                        │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │
│  │  │   Operational   │  │   Escrow Pool   │  │   Fee Account   │       │   │
│  │  │    Account      │  │    Account      │  │                 │       │   │
│  │  │                 │  │                 │  │                 │       │   │
│  │  │ Bank BCA        │  │ Bank Mandiri    │  │ Bank BCA        │       │   │
│  │  │ 123-456-7890    │  │ 098-765-4321    │  │ 111-222-3333    │       │   │
│  │  │                 │  │                 │  │                 │       │   │
│  │  │ For: Operating  │  │ For: User Funds │  │ For: 2.5% Fee   │       │   │
│  │  │ expenses        │  │ in escrow       │  │ revenue         │       │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │   │
│  │                                │                                       │   │
│  │                                ▼                                       │   │
│  │                    ┌───────────────────────┐                          │   │
│  │                    │   Ledger Database     │                          │   │
│  │                    │                       │                          │   │
│  │                    │ akad_id | balance     │                          │   │
│  │                    │ uuid-1  | 50,000,000  │                          │   │
│  │                    │ uuid-2  | 25,000,000  │                          │   │
│  │                    │ uuid-3  | 100,000,000 │                          │   │
│  │                    └───────────────────────┘                          │   │
│  │                                                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Virtual Account Ledger

```typescript
// escrow-ledger.service.ts
@Injectable()
export class EscrowLedgerService {
  constructor(private prisma: PrismaService) {}

  // Credit: When payment received
  async creditEscrow(akadId: string, amount: number, paymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create ledger entry
      await tx.escrowLedger.create({
        data: {
          id: uuidv4(),
          akad_id: akadId,
          type: 'CREDIT',
          amount,
          balance_after: await this.getBalance(akadId) + amount,
          reference_id: paymentId,
          reference_type: 'PAYMENT',
          description: 'Payment received from buyer',
        }
      });

      // 2. Update akad escrow balance
      await tx.akad.update({
        where: { id: akadId },
        data: {
          escrow_balance: { increment: amount },
        }
      });
    });
  }

  // Debit: When milestone released
  async debitEscrow(akadId: string, amount: number, milestoneId: string) {
    return this.prisma.$transaction(async (tx) => {
      const currentBalance = await this.getBalance(akadId);

      if (currentBalance < amount) {
        throw new InsufficientBalanceError();
      }

      // 1. Create ledger entry
      await tx.escrowLedger.create({
        data: {
          id: uuidv4(),
          akad_id: akadId,
          type: 'DEBIT',
          amount,
          balance_after: currentBalance - amount,
          reference_id: milestoneId,
          reference_type: 'MILESTONE_RELEASE',
          description: 'Released to seller for milestone completion',
        }
      });

      // 2. Update akad escrow balance
      await tx.akad.update({
        where: { id: akadId },
        data: {
          escrow_balance: { decrement: amount },
        }
      });
    });
  }

  async getBalance(akadId: string): Promise<number> {
    const akad = await this.prisma.akad.findUnique({
      where: { id: akadId },
      select: { escrow_balance: true }
    });
    return akad?.escrow_balance ?? 0;
  }
}
```

---

## Phase 5: Milestone Approval & Release

### 5.1 Milestone Completion Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MILESTONE APPROVAL & RELEASE FLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Seller        Witness        Buyer        Backend        Blockchain         │
│    │              │             │             │               │              │
│    │ Submit Work  │             │             │               │              │
│    │──────────────────────────────────────────▶               │              │
│    │              │             │             │               │              │
│    │              │ Approve     │             │               │              │
│    │              │─────────────────────────▶ │               │              │
│    │              │             │             │               │              │
│    │              │             │ Approve     │               │              │
│    │              │             │────────────▶│               │              │
│    │              │             │             │               │              │
│    │              │             │             │ Anchor        │              │
│    │              │             │             │──────────────▶│              │
│    │              │             │             │               │              │
│    │              │             │             │ Record        │              │
│    │              │             │             │ Release       │              │
│    │              │             │             │──────────────▶│              │
│    │              │             │             │               │              │
│    │ Bank Transfer│             │             │               │              │
│    │◀─────────────────────────────────────────│               │              │
│    │              │             │             │               │              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Milestone Service Implementation

```typescript
// milestone.service.ts
@Injectable()
export class MilestoneService {
  async submitMilestone(milestoneId: string, evidence: EvidenceDto) {
    const milestone = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        status: 'SUBMITTED',
        evidence_urls: evidence.urls,
        evidence_description: evidence.description,
        submitted_at: new Date(),
      }
    });

    // Notify witnesses and buyer
    await this.notifyMilestoneSubmission(milestone);

    return milestone;
  }

  async approveByWitness(milestoneId: string, witnessId: string, note: string) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { akad: true }
    });

    // Record witness approval
    await this.prisma.witnessApproval.create({
      data: {
        id: uuidv4(),
        milestone_id: milestoneId,
        witness_id: witnessId,
        approved_at: new Date(),
        note,
      }
    });

    // Check if all required witnesses approved
    const approvalCount = await this.prisma.witnessApproval.count({
      where: { milestone_id: milestoneId }
    });

    const requiredWitnesses = await this.prisma.witness.count({
      where: { akad_id: milestone.akad_id, status: 'ACTIVE' }
    });

    if (approvalCount >= requiredWitnesses) {
      await this.prisma.milestone.update({
        where: { id: milestoneId },
        data: { status: 'WITNESS_APPROVED' }
      });

      // Anchor witness approval to blockchain
      await this.blockchainQueue.add('anchor-witness-approval', {
        milestoneId,
        akadId: milestone.akad_id,
        approvalCount,
      });
    }

    // Notify buyer for final approval
    await this.notifyBuyerForApproval(milestone);
  }

  async approveByBuyer(milestoneId: string, buyerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({
        where: { id: milestoneId },
        include: { akad: true }
      });

      // 1. Update milestone status
      await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          status: 'APPROVED',
          buyer_approved_at: new Date(),
        }
      });

      // 2. Debit escrow
      await this.escrowLedger.debitEscrow(
        milestone.akad_id,
        milestone.amount,
        milestoneId
      );

      // 3. Queue bank transfer to seller
      await this.disbursementQueue.add('disburse-milestone', {
        milestoneId,
        sellerId: milestone.akad.seller_id,
        amount: milestone.amount,
      });

      // 4. Anchor release to blockchain
      await this.blockchainQueue.add('anchor-release', {
        milestoneId,
        akadId: milestone.akad_id,
        amount: milestone.amount,
      });

      // 5. Check if all milestones completed
      await this.checkAkadCompletion(milestone.akad_id);
    });
  }
}
```

### 5.3 Disbursement to Seller

```typescript
// disbursement.service.ts
@Processor('disbursement')
export class DisbursementProcessor {
  @Process('disburse-milestone')
  async disburseMilestone(job: Job<DisburseMilestoneJob>) {
    const { milestoneId, sellerId, amount } = job.data;

    // 1. Get seller bank info
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      include: { bankAccounts: { where: { is_primary: true } } }
    });

    const bankAccount = seller.bankAccounts[0];

    // 2. Create disbursement via Xendit
    const disbursement = await this.xenditClient.disbursement.create({
      externalId: `DISBURSE-${milestoneId}`,
      amount,
      bankCode: bankAccount.bank_code,
      accountHolderName: bankAccount.account_holder_name,
      accountNumber: bankAccount.account_number,
      description: `AMANTRA Milestone Payment`,
    });

    // 3. Record disbursement
    await this.prisma.disbursement.create({
      data: {
        id: uuidv4(),
        milestone_id: milestoneId,
        seller_id: sellerId,
        amount,
        xendit_disbursement_id: disbursement.id,
        status: 'PENDING',
        bank_code: bankAccount.bank_code,
        account_number: bankAccount.account_number,
      }
    });

    this.logger.log(`Disbursement created: ${disbursement.id}`);
  }
}
```

---

## Phase 6: Dispute & Resolution

### 6.1 Dispute Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DISPUTE RESOLUTION FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Party          Backend        Majelis        Hisbah        Blockchain       │
│    │               │              │             │               │            │
│    │ Raise Dispute │              │             │               │            │
│    │──────────────▶│              │             │               │            │
│    │               │              │             │               │            │
│    │               │ Anchor       │             │               │            │
│    │               │──────────────────────────────────────────▶│            │
│    │               │              │             │               │            │
│    │               │ Assign       │             │               │            │
│    │               │─────────────▶│             │               │            │
│    │               │              │             │               │            │
│    │               │              │ Review      │               │            │
│    │               │              │─────────────▶               │            │
│    │               │              │             │               │            │
│    │               │              │ Vote        │               │            │
│    │               │◀─────────────│             │               │            │
│    │               │              │             │               │            │
│    │               │ Anchor       │             │               │            │
│    │               │ Resolution   │             │               │            │
│    │               │──────────────────────────────────────────▶│            │
│    │               │              │             │               │            │
│    │ Result        │              │             │               │            │
│    │◀──────────────│              │             │               │            │
│    │               │              │             │               │            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Webhook Security

```typescript
// Verify Xendit webhook signature
function verifyXenditWebhook(token: string, expectedToken: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expectedToken)
  );
}
```

### Idempotency

```typescript
// Prevent duplicate webhook processing
async function processWebhook(webhookId: string, handler: () => Promise<void>) {
  const lock = await this.redis.set(
    `webhook:lock:${webhookId}`,
    '1',
    'EX', 300, // 5 minute lock
    'NX' // Only set if not exists
  );

  if (!lock) {
    return { status: 'duplicate' };
  }

  try {
    await handler();
    return { status: 'processed' };
  } finally {
    await this.redis.del(`webhook:lock:${webhookId}`);
  }
}
```

### Transaction Ordering

```typescript
// Ensure blockchain events are processed in order
async function processBlockchainEvent(event: BlockchainEvent) {
  const lastProcessed = await this.getLastProcessedBlock();

  if (event.blockNumber <= lastProcessed) {
    return; // Already processed
  }

  // Process sequentially
  await this.queue.add('process-event', event, {
    jobId: `block-${event.blockNumber}-${event.logIndex}`,
  });
}
```

---

## Monitoring & Observability

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `payment_webhook_latency` | Time from Xendit to processing | > 5 seconds |
| `blockchain_anchor_latency` | Time to anchor on chain | > 30 seconds |
| `escrow_balance_mismatch` | Diff between ledger and actual | > 0 |
| `failed_disbursements` | Failed bank transfers | > 0 |
| `pending_webhooks` | Webhooks awaiting processing | > 100 |

### Alerting Rules

```yaml
# prometheus-rules.yml
groups:
  - name: amantra-payment
    rules:
      - alert: WebhookProcessingDelay
        expr: payment_webhook_queue_size > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Payment webhook queue backing up"

      - alert: BlockchainAnchoringFailed
        expr: rate(blockchain_anchor_failures_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Blockchain anchoring failures detected"
```

---

## Summary

The QRIS to Blockchain flow ensures:
1. **User-Friendly Payment**: Users pay via familiar QRIS
2. **Secure Fund Management**: Off-chain escrow with proper accounting
3. **Immutable Audit Trail**: All key events anchored on blockchain
4. **Syariah Compliance**: Clear akad, milestone-based release
5. **Transparent Governance**: Dispute resolution via Majelis with Hisbah oversight
