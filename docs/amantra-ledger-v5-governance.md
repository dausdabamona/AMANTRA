# AMANTRALEDGERV5 - ZERO SINGLE POINT OF FAILURE

## Governance Architecture & Operations Manual

**Version:** 1.0.0
**Effective Date:** 2026-01-20
**Status:** ACTIVE

---

## PRINSIP UTAMA (SOP 7 PILAR 1)

> **"Tidak boleh ada satu manusia, satu kunci, satu server, atau satu institusi yang jika hilang membuat dana, keadilan, atau sistem mati."**

> **"Al-amru idza ta'allaqa bi huquqil 'ibad la yajuzu an yu'allaqa bi fardh wahid."**
> (Urusan hak manusia tidak boleh bergantung pada satu orang)

---

## 1. MULTI-LAYER MULTISIG ARCHITECTURE

### 1.1 Governance Hierarchy

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                      AMANTRA GOVERNANCE HIERARCHY                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   Level 0: PIAGAM KEADILAN (Immutable Constitution)                            ║
║   ════════════════════════════════════════════════                             ║
║                              │                                                  ║
║                              ▼                                                  ║
║   Level 1: HISBAH_MULTISIG                                                     ║
║   ┌─────────────────────────────────────────────────────────────┐              ║
║   │  Role: Oversight, Veto, Constitutional Guardian              │              ║
║   │  Threshold: 3-of-5 minimum                                   │              ║
║   │  Members: 5 minimum (Ulama, Legal Experts, Community Reps)   │              ║
║   │  Powers:                                                     │              ║
║   │  • Veto any succession                                       │              ║
║   │  • Approve/reject upgrades                                   │              ║
║   │  • Freeze bank escrow                                        │              ║
║   │  • Pause/unpause system                                      │              ║
║   │  • Override in recovery mode                                 │              ║
║   └─────────────────────────────────────────────────────────────┘              ║
║                              │                                                  ║
║                              ▼                                                  ║
║   Level 2: OPERATIONAL MULTISIGS                                               ║
║   ┌─────────────────────────────────────────────────────────────┐              ║
║   │                                                              │              ║
║   │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │              ║
║   │   │   ORACLE     │    │  ARBITRATION │    │   BACKUP     │  │              ║
║   │   │  MULTISIG    │    │   COUNCIL    │    │  MULTISIG    │  │              ║
║   │   │  (3-of-5)    │    │   (2-of-3)   │    │  (4-of-7)    │  │              ║
║   │   ├──────────────┤    ├──────────────┤    ├──────────────┤  │              ║
║   │   │ Settlement   │    │ Dispute      │    │ Disaster     │  │              ║
║   │   │ Execution    │    │ Resolution   │    │ Recovery     │  │              ║
║   │   │ Upgrade Init │    │ Evidence     │    │ Dead Man     │  │              ║
║   │   │ Bank Mgmt    │    │ Review       │    │ Switch       │  │              ║
║   │   └──────────────┘    └──────────────┘    └──────────────┘  │              ║
║   │                                                              │              ║
║   └─────────────────────────────────────────────────────────────┘              ║
║                              │                                                  ║
║                              ▼                                                  ║
║   Level 3: EXECUTION MULTISIGS                                                 ║
║   ┌─────────────────────────────────────────────────────────────┐              ║
║   │                                                              │              ║
║   │   ┌──────────────┐    ┌──────────────┐                      │              ║
║   │   │  OPERATOR    │    │  EMERGENCY   │                      │              ║
║   │   │  MULTISIG    │    │  MULTISIG    │                      │              ║
║   │   │  (2-of-3)    │    │  (2-of-3)    │                      │              ║
║   │   ├──────────────┤    ├──────────────┤                      │              ║
║   │   │ Contract     │    │ Circuit      │                      │              ║
║   │   │ Creation     │    │ Breaker      │                      │              ║
║   │   │ Status Mgmt  │    │ Pause Only   │                      │              ║
║   │   │ Day-to-day   │    │ No Settle    │                      │              ║
║   │   └──────────────┘    └──────────────┘                      │              ║
║   │                                                              │              ║
║   └─────────────────────────────────────────────────────────────┘              ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 1.2 Multisig Requirements

| Role | Min Members | Min Threshold | Max Single Point | Heartbeat |
|------|-------------|---------------|------------------|-----------|
| OPERATOR | 3 | 2-of-3 | 1 key per person | 30 days |
| ORACLE | 5 | 3-of-5 | 1 key per person | 30 days |
| EMERGENCY | 3 | 2-of-3 | 1 key per person | 30 days |
| ARBITRATION | 3 | 2-of-3 | 1 key per person | 30 days |
| HISBAH | 5 | 3-of-5 | 1 key per person | 30 days |
| BACKUP | 7 | 4-of-7 | 1 key per person | 30 days |

### 1.3 Role Separation Rules

```
╔════════════════════════════════════════════════════════════════════╗
║                    ROLE SEPARATION MATRIX                           ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                     ║
║   RULE 1: No address can hold multiple critical roles               ║
║   ─────────────────────────────────────────────────────             ║
║   • One Gnosis Safe = One Role                                      ║
║   • Enforced on-chain at initialization and succession              ║
║                                                                     ║
║   RULE 2: No individual can be signer in conflicting multisigs      ║
║   ─────────────────────────────────────────────────────             ║
║   • OPERATOR signer ≠ ARBITRATION signer                           ║
║   • ORACLE signer ≠ HISBAH signer                                  ║
║   • Enforced via governance policy (off-chain)                      ║
║                                                                     ║
║   RULE 3: Backup must be independent                                ║
║   ─────────────────────────────────────────────────────             ║
║   • BACKUP signers ≠ Any other multisig signers                    ║
║   • BACKUP members from different institutions                      ║
║                                                                     ║
║   CONFLICT MATRIX:                                                  ║
║   ┌──────────┬────────┬────────┬─────────┬───────┬────────┬──────┐ ║
║   │          │OPERATOR│ ORACLE │EMERGENCY│ARBITR │HISBAH │BACKUP│ ║
║   ├──────────┼────────┼────────┼─────────┼───────┼────────┼──────┤ ║
║   │ OPERATOR │   -    │   ✓    │    ✓    │   ✗   │   ✗   │  ✗   │ ║
║   │ ORACLE   │   ✓    │   -    │    ✓    │   ✗   │   ✗   │  ✗   │ ║
║   │ EMERGENCY│   ✓    │   ✓    │    -    │   ✓   │   ✓   │  ✗   │ ║
║   │ ARBITR   │   ✗    │   ✗    │    ✓    │   -   │   ✓   │  ✗   │ ║
║   │ HISBAH   │   ✗    │   ✗    │    ✓    │   ✓   │   -   │  ✗   │ ║
║   │ BACKUP   │   ✗    │   ✗    │    ✗    │   ✗   │   ✗   │  -   │ ║
║   └──────────┴────────┴────────┴─────────┴───────┴────────┴──────┘ ║
║   ✓ = Can share signers, ✗ = Must not share signers                 ║
║                                                                     ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## 2. DEAD MAN SWITCH FLOW

### 2.1 Overview

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         DEAD MAN SWITCH MECHANISM                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   PURPOSE: Automatically transfer control when a critical role becomes          ║
║            unresponsive for 180 days (6 months)                                ║
║                                                                                 ║
║   TRIGGERS:                                                                     ║
║   • No transactions from multisig for 180 days                                 ║
║   • No heartbeat received for 180 days                                         ║
║   • No activity recorded in contract state                                      ║
║                                                                                 ║
║   ACTIONS:                                                                      ║
║   • Transfer role authority to designated BACKUP                               ║
║   • Activate RECOVERY mode                                                      ║
║   • Freeze non-essential operations                                            ║
║   • Allow protective operations (refunds, dispute resolution)                  ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 2.2 Dead Man Switch Flow Diagram

```
                              ┌─────────────────────┐
                              │   NORMAL OPERATION  │
                              │  lastActivity = now │
                              └──────────┬──────────┘
                                         │
                                         ▼
                    ┌────────────────────────────────────┐
                    │      HEARTBEAT MONITORING          │
                    │   (Every 30 days recommended)      │
                    └────────────────┬───────────────────┘
                                     │
                          ┌──────────┴──────────┐
                          │                     │
                          ▼                     ▼
               ┌──────────────────┐  ┌──────────────────┐
               │  HEARTBEAT SENT  │  │  NO HEARTBEAT    │
               │  Activity Reset  │  │  Counter Ticking │
               └────────┬─────────┘  └────────┬─────────┘
                        │                     │
                        ▼                     ▼
               ┌──────────────────┐  ┌──────────────────┐
               │  Continue Normal │  │  Day 30: Warning │
               │  Operations      │  │  Day 60: Alert   │
               └──────────────────┘  │  Day 90: Critical│
                                     │  Day 120: Danger │
                                     │  Day 150: Final  │
                                     │  Day 180: TRIGGER│
                                     └────────┬─────────┘
                                              │
                                              ▼
                              ┌───────────────────────────┐
                              │   ANYONE CAN CALL:        │
                              │   triggerDeadManSwitch()  │
                              └─────────────┬─────────────┘
                                            │
                                            ▼
                              ┌───────────────────────────┐
                              │   VALIDATION CHECKS:      │
                              │   1. lastActivity + 180d  │
                              │      < block.timestamp    │
                              │   2. Backup is available  │
                              │   3. Role is active       │
                              └─────────────┬─────────────┘
                                            │
                           ┌────────────────┴────────────────┐
                           │                                 │
                           ▼                                 ▼
                ┌────────────────────┐           ┌────────────────────┐
                │   CHECKS PASSED    │           │   CHECKS FAILED    │
                │                    │           │                    │
                │ 1. Revoke old role │           │ Revert with error: │
                │ 2. Grant to backup │           │ DeadManSwitchNot   │
                │ 3. Update config   │           │ Triggerable        │
                │ 4. Emit event      │           │                    │
                │ 5. Enter RECOVERY  │           │                    │
                └─────────┬──────────┘           └────────────────────┘
                          │
                          ▼
                ┌────────────────────┐
                │   RECOVERY MODE    │
                │                    │
                │ • Limited ops only │
                │ • Refunds allowed  │
                │ • Disputes cont.   │
                │ • No new contracts │
                │ • Hisbah oversight │
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │  RECOVERY ACTIONS  │
                │                    │
                │ 1. Appoint new     │
                │    permanent role  │
                │ 2. Review all      │
                │    pending ops     │
                │ 3. Hisbah approves │
                │    return to normal│
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │   NORMAL RESUMED   │
                │   (after Hisbah    │
                │    approval)       │
                └────────────────────┘
```

### 2.3 Dead Man Switch per Role

| Role | Backup Inheritor | Actions Inherited | Restrictions |
|------|------------------|-------------------|--------------|
| ORACLE | BACKUP_MULTISIG | Settlement, Bank Mgmt | No upgrades until new Oracle |
| OPERATOR | BACKUP_MULTISIG | Contract ops, Funding | Limited to protective ops |
| ARBITRATION | BACKUP_MULTISIG | Dispute resolution | Cannot start new reviews |
| HISBAH | BACKUP_MULTISIG | Oversight, Veto | Full powers with extra caution |

---

## 3. SUCCESSION & KEY ROTATION FLOW

### 3.1 Succession Protocol Overview

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        SUCCESSION PROTOCOL                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   TIMELOCK: 7 days minimum                                                     ║
║   APPROVALS: Current holder proposal + Hisbah approval                         ║
║   VALIDATION: New multisig must meet minimum requirements                       ║
║                                                                                 ║
║   WHO CAN PROPOSE:                                                             ║
║   • Current role holder (voluntary transition)                                 ║
║   • Hisbah (forced transition for cause)                                       ║
║                                                                                 ║
║   WHO MUST APPROVE:                                                            ║
║   • Hisbah (always required)                                                   ║
║                                                                                 ║
║   WHO CAN EXECUTE:                                                             ║
║   • Anyone (after timelock + approval)                                         ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 3.2 Succession Flow Diagram

```
                    ┌─────────────────────────────────┐
                    │      SUCCESSION TRIGGER         │
                    │                                 │
                    │  • Voluntary rotation           │
                    │  • Key compromise suspected     │
                    │  • Member resignation           │
                    │  • Performance issues           │
                    │  • Term limit reached           │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   STEP 1: PROPOSE SUCCESSION    │
                    │                                 │
                    │   proposeRoleSuccession(        │
                    │     role,                       │
                    │     newMultisig,                │
                    │     reason                      │
                    │   )                             │
                    │                                 │
                    │   Caller: Current holder OR     │
                    │           Hisbah                │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   VALIDATION:                   │
                    │                                 │
                    │   1. Caller authorized?         │
                    │   2. New address is zero?       │
                    │   3. New address already has    │
                    │      critical role?             │
                    │   4. New multisig valid?        │
                    │      • Gnosis Safe interface    │
                    │      • Threshold >= 2           │
                    │      • Members >= min required  │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   PROPOSAL CREATED              │
                    │                                 │
                    │   • proposalId assigned         │
                    │   • proposedAt = now            │
                    │   • executeAfter = now + 7 days │
                    │   • hisbahApproved = false      │
                    │                                 │
                    │   Event: SuccessionProposed     │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌─────────────────────┐       ┌─────────────────────┐
        │  PUBLIC NOTICE      │       │  HISBAH REVIEW      │
        │  PERIOD (7 DAYS)    │       │                     │
        │                     │       │  • Review new       │
        │  • Community aware  │       │    multisig members │
        │  • Objections can   │       │  • Verify no        │
        │    be raised        │       │    conflicts        │
        │  • Media coverage   │       │  • Check competence │
        └─────────┬───────────┘       └──────────┬──────────┘
                  │                              │
                  │                              ▼
                  │               ┌─────────────────────────────┐
                  │               │   STEP 2: HISBAH APPROVAL   │
                  │               │                             │
                  │               │   approveSuccession(        │
                  │               │     proposalId              │
                  │               │   )                         │
                  │               │                             │
                  │               │   Caller: HISBAH_MULTISIG   │
                  │               │                             │
                  │               │   Event: SuccessionApproved │
                  │               └──────────────┬──────────────┘
                  │                              │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────────────┐
                    │   TIMELOCK CHECK                │
                    │                                 │
                    │   block.timestamp >= executeAfter?│
                    └───────────────┬─────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                         ▼                     ▼
              ┌────────────────────┐ ┌────────────────────┐
              │   TIMELOCK PASSED  │ │ TIMELOCK PENDING   │
              └─────────┬──────────┘ │                    │
                        │            │ Wait until         │
                        │            │ executeAfter       │
                        │            └────────────────────┘
                        ▼
                    ┌─────────────────────────────────┐
                    │   STEP 3: EXECUTE SUCCESSION    │
                    │                                 │
                    │   executeRoleSuccession(        │
                    │     proposalId                  │
                    │   )                             │
                    │                                 │
                    │   Caller: Anyone                │
                    │                                 │
                    │   CHECKS:                       │
                    │   1. Not already executed       │
                    │   2. Not cancelled              │
                    │   3. Timelock passed            │
                    │   4. Hisbah approved            │
                    │   5. New multisig still valid   │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   EXECUTION:                    │
                    │                                 │
                    │   1. Revoke role from old       │
                    │   2. Grant role to new          │
                    │   3. Update multisig config     │
                    │   4. Update address roles map   │
                    │   5. Reset activity timestamp   │
                    │                                 │
                    │   Event: SuccessionExecuted     │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   SUCCESSION COMPLETE           │
                    │                                 │
                    │   • Old multisig has no role    │
                    │   • New multisig has full role  │
                    │   • System continues normally   │
                    └─────────────────────────────────┘
```

### 3.3 Succession Cancellation

```
                    ┌─────────────────────────────────┐
                    │   CANCELLATION TRIGGERS         │
                    │                                 │
                    │   • New multisig compromised    │
                    │   • Conflict of interest found  │
                    │   • Community objection valid   │
                    │   • Legal issues discovered     │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │   cancelSuccession(             │
                    │     proposalId,                 │
                    │     reason                      │
                    │   )                             │
                    │                                 │
                    │   Caller: HISBAH_MULTISIG only  │
                    │                                 │
                    │   Event: SuccessionCancelled    │
                    └─────────────────────────────────┘
```

---

## 4. UPGRADE SAFETY PROTOCOL

### 4.1 Triple Approval + 72h Timelock

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         UPGRADE SAFETY PROTOCOL                                ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   REQUIREMENTS FOR ANY UPGRADE:                                                ║
║                                                                                 ║
║   1. ✓ Oracle Multisig Proposal                                                ║
║   2. ✓ Hisbah Multisig Approval                                                ║
║   3. ✓ Public Announcement (72h before execution)                              ║
║   4. ✓ 72-hour Timelock                                                        ║
║   5. ✓ Code Hash Verification (no code change after proposal)                  ║
║                                                                                 ║
║   PROTECTED RIGHTS (Cannot be removed by upgrade):                             ║
║   • RIGHT_TO_ESCROW_REFUND                                                     ║
║   • RIGHT_TO_RAISE_DISPUTE                                                     ║
║   • RIGHT_TO_FAIR_HEARING                                                      ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 4.2 Upgrade Flow

```
     Day 0                    Day 1-3                    Day 3+
       │                         │                         │
       ▼                         ▼                         ▼
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│   PROPOSE   │          │   REVIEW    │          │   EXECUTE   │
│             │          │             │          │             │
│ Oracle      │───────▶  │ Hisbah      │───────▶  │ Anyone      │
│ proposes    │          │ reviews     │          │ executes    │
│ upgrade     │          │ & approves  │          │ after 72h   │
└─────────────┘          └─────────────┘          └─────────────┘
       │                         │                         │
       ▼                         ▼                         ▼
  Code Hash             Public                        Verify
  Recorded              Announcement                  Hash Match
```

---

## 5. EMERGENCY RECOVERY SCENARIOS

### 5.1 Scenario: Oracle Multisig Key Loss

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                 SCENARIO: ORACLE MULTISIG KEY LOSS                             ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   SYMPTOMS:                                                                     ║
║   • No settlement transactions for extended period                             ║
║   • Heartbeat not received for > 30 days                                       ║
║   • Oracle members unresponsive                                                ║
║                                                                                 ║
║   TIMELINE:                                                                     ║
║   ┌─────────────────────────────────────────────────────────────────────┐      ║
║   │ Day 0    │ Last Oracle activity recorded                            │      ║
║   │ Day 30   │ Warning: Heartbeat overdue                               │      ║
║   │ Day 60   │ Alert: Community notified                                │      ║
║   │ Day 90   │ Critical: Hisbah investigates                           │      ║
║   │ Day 120  │ Danger: Backup prepares                                  │      ║
║   │ Day 150  │ Final Warning: Public announcement                       │      ║
║   │ Day 180  │ TRIGGER: Anyone calls triggerDeadManSwitch(ORACLE)      │      ║
║   └─────────────────────────────────────────────────────────────────────┘      ║
║                                                                                 ║
║   AUTOMATIC ACTIONS:                                                           ║
║   1. Oracle role transferred to BACKUP_MULTISIG                                ║
║   2. System enters RECOVERY mode                                               ║
║   3. New contracts blocked                                                      ║
║   4. Settlements continue via Backup                                           ║
║   5. Event: DeadManSwitchTriggered emitted                                     ║
║                                                                                 ║
║   RECOVERY PATH:                                                               ║
║   1. Backup operates as temporary Oracle                                        ║
║   2. Hisbah proposes new permanent Oracle via succession                       ║
║   3. 7-day timelock for new Oracle succession                                  ║
║   4. Hisbah approves return to NORMAL mode                                     ║
║                                                                                 ║
║   USER IMPACT:                                                                 ║
║   • Existing contracts: Continue normally                                      ║
║   • Pending settlements: Executed by Backup                                    ║
║   • New contracts: Blocked until recovery complete                             ║
║   • Disputes: Continue normally                                                ║
║   • Refunds: Always available                                                  ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 5.2 Scenario: Arbitrator Multisig Compromise

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║              SCENARIO: ARBITRATOR MULTISIG COMPROMISE                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   SYMPTOMS:                                                                     ║
║   • Suspicious resolution queued                                               ║
║   • Arbitrator behavior erratic                                                ║
║   • Unauthorized access detected                                               ║
║                                                                                 ║
║   IMMEDIATE ACTIONS (Within 24h timelock):                                     ║
║   ┌─────────────────────────────────────────────────────────────────────┐      ║
║   │ 1. Hisbah OR Emergency can PAUSE the system                         │      ║
║   │ 2. Hisbah reviews all queued resolutions                            │      ║
║   │ 3. Affected parties can APPEAL resolutions                          │      ║
║   │ 4. Hisbah proposes immediate succession                             │      ║
║   └─────────────────────────────────────────────────────────────────────┘      ║
║                                                                                 ║
║   SUCCESSION PATH:                                                             ║
║   1. Hisbah calls proposeRoleSuccession(ARBITRATION, newMultisig)              ║
║   2. Given emergency, Hisbah self-approves immediately                         ║
║   3. 7-day timelock still applies (for due process)                            ║
║   4. Backup handles disputes during transition                                  ║
║                                                                                 ║
║   USER PROTECTION:                                                             ║
║   • All queued resolutions require re-review                                   ║
║   • 24-48h timelock prevents immediate harm                                    ║
║   • Appeal mechanism available                                                  ║
║   • Evidence preserved on-chain                                                ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 5.3 Scenario: Admin Key Leak

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENARIO: ADMIN KEY LEAK                                    ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   NOTE: DEFAULT_ADMIN_ROLE in V5 has LIMITED powers:                           ║
║   • Cannot settle contracts                                                    ║
║   • Cannot resolve disputes                                                    ║
║   • Cannot upgrade without Oracle + Hisbah                                     ║
║   • Cannot freeze bank escrow                                                  ║
║                                                                                 ║
║   ADMIN CAN ONLY:                                                              ║
║   • Grant/revoke roles (but critical roles need succession protocol)           ║
║                                                                                 ║
║   MITIGATION DESIGN:                                                           ║
║   • Role changes require succession protocol                                   ║
║   • Hisbah approval required for all critical changes                          ║
║   • Admin alone cannot cause fund loss                                         ║
║                                                                                 ║
║   RESPONSE IF LEAKED:                                                          ║
║   1. Hisbah pauses system                                                      ║
║   2. Hisbah proposes new admin via succession                                  ║
║   3. Old admin role revoked after timelock                                     ║
║   4. System resumes normally                                                   ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 5.4 Scenario: Bank Partner Collapse

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                  SCENARIO: BANK PARTNER COLLAPSE                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   DESIGN: Multi-bank escrow with automatic failover                            ║
║                                                                                 ║
║   BANK CONFIGURATION:                                                          ║
║   ┌─────────────────────────────────────────────────────────────────────┐      ║
║   │ PRIMARY:   Bank Syariah Indonesia (BSI)                             │      ║
║   │ SECONDARY: Bank Negara Indonesia (BNI Syariah)                      │      ║
║   │ EMERGENCY: CIMB Niaga Syariah                                       │      ║
║   └─────────────────────────────────────────────────────────────────────┘      ║
║                                                                                 ║
║   RESPONSE PROTOCOL:                                                           ║
║   ┌─────────────────────────────────────────────────────────────────────┐      ║
║   │ 1. DETECT: Bank issues reported (news, API failures)                │      ║
║   │ 2. FREEZE: Oracle OR Hisbah freezes affected bank escrow            │      ║
║   │ 3. REDIRECT: New contracts use SECONDARY bank                       │      ║
║   │ 4. MIGRATE: Oracle initiates fund migration (off-chain)             │      ║
║   │ 5. UPDATE: Contract bank references updated                         │      ║
║   │ 6. UNFREEZE: After migration, old bank removed                      │      ║
║   └─────────────────────────────────────────────────────────────────────┘      ║
║                                                                                 ║
║   ON-CHAIN FUNCTIONS:                                                          ║
║   • freezeBankEscrow(bankId, reason) - Hisbah or Oracle                        ║
║   • initiateBankMigration(fromBank, toBank, amount) - Oracle                   ║
║   • getAvailableBank() - Automatic fallback                                    ║
║                                                                                 ║
║   USER IMPACT:                                                                 ║
║   • Existing contracts: Migrated to new bank                                   ║
║   • New contracts: Automatically use backup bank                               ║
║   • Settlements: Continue via backup bank                                      ║
║   • No fund loss if migration successful                                        ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 5.5 Scenario: Blockchain Fork/Network Issues

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                  SCENARIO: BLOCKCHAIN FORK                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                 ║
║   DESIGN PRINCIPLE: Off-chain evidence + On-chain state                        ║
║                                                                                 ║
║   DATA PRESERVATION:                                                           ║
║   • Contract state: On-chain (preserved on canonical chain)                    ║
║   • Evidence: IPFS (chain-independent)                                         ║
║   • Decisions: IPFS + on-chain hash                                            ║
║   • Bank records: Off-chain (bank's system)                                    ║
║                                                                                 ║
║   FORK RESPONSE:                                                               ║
║   1. Identify canonical chain (community consensus)                            ║
║   2. All operations on canonical chain only                                    ║
║   3. Fork chain state ignored                                                  ║
║   4. Bank settlements unaffected (off-chain)                                   ║
║                                                                                 ║
║   MIGRATION CAPABILITY:                                                        ║
║   • State export functions available                                           ║
║   • Can deploy to new chain if needed                                          ║
║   • Legal framework allows chain migration                                      ║
║                                                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 6. HEARTBEAT SCHEDULE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HEARTBEAT SCHEDULE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   RECOMMENDED SCHEDULE:                                                      │
│                                                                              │
│   ┌─────────────┬──────────────────────┬─────────────────────────────────┐  │
│   │ Role        │ Heartbeat Frequency  │ Monitoring                      │  │
│   ├─────────────┼──────────────────────┼─────────────────────────────────┤  │
│   │ OPERATOR    │ Every 7 days         │ Automated backend job           │  │
│   │ ORACLE      │ Every 14 days        │ Settlement activity counts      │  │
│   │ ARBITRATION │ Every 14 days        │ Dispute resolution activity     │  │
│   │ HISBAH      │ Every 30 days        │ Oversight review activity       │  │
│   │ EMERGENCY   │ Every 30 days        │ Manual check                    │  │
│   │ BACKUP      │ Every 30 days        │ Automated health check          │  │
│   └─────────────┴──────────────────────┴─────────────────────────────────┘  │
│                                                                              │
│   HEARTBEAT FUNCTION:                                                        │
│   sendHeartbeat(MultisigRole role)                                          │
│   • Updates lastActivityAt                                                   │
│   • Emits HeartbeatReceived event                                           │
│   • Resets dead man switch timer                                            │
│                                                                              │
│   AUTOMATIC ACTIVITY:                                                        │
│   • Any transaction from multisig also counts as heartbeat                  │
│   • markFunded, markSettled, queueResolution all count                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. SYSTEM MODE TRANSITIONS

```
                         ┌─────────────────┐
                         │     NORMAL      │
                         │                 │
                         │ • All ops work  │
                         │ • New contracts │
                         │ • Settlements   │
                         └────────┬────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
            ▼                     ▼                     ▼
   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
   │    EMERGENCY    │   │    RECOVERY     │   │   DISSOLUTION   │
   │                 │   │                 │   │                 │
   │ • Paused        │   │ • Backup control│   │ • Wind down     │
   │ • No settlements│   │ • Limited ops   │   │ • Claims period │
   │ • No new        │   │ • Protective    │   │ • Final settle  │
   │   contracts     │   │   only          │   │ • Archive       │
   └────────┬────────┘   └────────┬────────┘   └─────────────────┘
            │                     │
            │                     │
            └──────────┬──────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     NORMAL      │
              │  (After Hisbah  │
              │   approval)     │
              └─────────────────┘
```

---

## APPENDIX: SMART CONTRACT FUNCTIONS REFERENCE

### A. Multisig Management

```solidity
// Register multisig (initialize only)
function _validateAndRegisterMultisig(MultisigRole role, address multisig, uint256 minMembers)

// Send heartbeat
function sendHeartbeat(MultisigRole role) external onlyMultisig(role)

// Trigger dead man switch
function triggerDeadManSwitch(MultisigRole role) external nonReentrant

// Check dead man switch status
function canTriggerDeadManSwitch(MultisigRole role) external view returns (bool, uint64, uint64)
```

### B. Succession Management

```solidity
// Propose succession
function proposeRoleSuccession(MultisigRole role, address newMultisig, string calldata reason) external returns (uint256)

// Approve succession (Hisbah only)
function approveSuccession(uint256 proposalId) external onlyMultisig(MultisigRole.HISBAH)

// Execute succession (anyone after timelock)
function executeRoleSuccession(uint256 proposalId) external nonReentrant

// Cancel succession (Hisbah only)
function cancelSuccession(uint256 proposalId, string calldata reason) external onlyMultisig(MultisigRole.HISBAH)
```

### C. Upgrade Management

```solidity
// Propose upgrade (Oracle only)
function proposeUpgrade(address newImplementation) external onlyMultisig(MultisigRole.ORACLE) returns (uint256)

// Approve upgrade (Hisbah only)
function approveUpgrade(uint256 proposalId) external onlyMultisig(MultisigRole.HISBAH)

// Announce upgrade publicly (Oracle only)
function announceUpgradePublicly(uint256 proposalId) external onlyMultisig(MultisigRole.ORACLE)

// Execute upgrade (Oracle only, after all approvals + timelock)
function executeUpgrade(uint256 proposalId) external onlyMultisig(MultisigRole.ORACLE) nonReentrant

// Cancel upgrade (Hisbah only)
function cancelUpgrade(uint256 proposalId, string calldata reason) external onlyMultisig(MultisigRole.HISBAH)
```

### D. Bank Escrow Management

```solidity
// Add bank escrow partner
function addBankEscrow(bytes32 bankId, string calldata bankName, bool isPrimary) external onlyMultisig(MultisigRole.ORACLE)

// Freeze bank escrow (Hisbah or Oracle)
function freezeBankEscrow(bytes32 bankId, string calldata reason) external

// Unfreeze bank escrow (Hisbah only)
function unfreezeBankEscrow(bytes32 bankId) external onlyMultisig(MultisigRole.HISBAH)

// Initiate bank migration
function initiateBankMigration(bytes32 fromBankId, bytes32 toBankId, uint256 amount) external onlyMultisig(MultisigRole.ORACLE)

// Get available bank for new contract
function getAvailableBank() public view returns (bytes32)
```

### E. System Mode Management

```solidity
// Pause system (Emergency, Hisbah, or Oracle)
function pause(string calldata reason) external

// Unpause system (Hisbah only)
function unpause() external onlyMultisig(MultisigRole.HISBAH)

// Activate recovery mode (Backup only)
function activateRecoveryMode(string calldata reason) external onlyMultisig(MultisigRole.BACKUP)

// Deactivate recovery mode (Hisbah only)
function deactivateRecoveryMode() external onlyMultisig(MultisigRole.HISBAH) onlyInMode(SystemMode.RECOVERY)
```

---

*Document Version: 1.0.0*
*Last Updated: 2026-01-20*
