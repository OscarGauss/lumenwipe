# Technical Specification

> **Draft.** This document describes the intended architecture and technology choices. Implementation details, library versions, and component boundaries are subject to change as development progresses.

## 1. System Overview

The Account Demolisher is structured as two loosely coupled layers: a stateless backend service that aggregates DeFi position data and routing intelligence, and a frontend application where all transaction construction and signing occurs. The separation is deliberate: the backend handles read-only, computationally expensive queries against the Stellar Indexer, Soroban RPC, and the DeFi Position API, while the frontend retains exclusive control over private key material and transaction signing.

```
+----------------------------------+        +----------------------------------+
|         Browser / Client         |        |         Backend Service          |
|                                  |        |                                  |
|  stellar-wallets-kit             |        |  DeFi Position Aggregator        |
|  (Freighter, Albedo, xBull, ...) |        |  (OctoPos / Orion adapter)       |
|                                  |        |                                  |
|  Secret Key Input (optional)     |        |  DEX Routing Engine              |
|                                  |        |  (StellarExpert + Aquarius)      |
|  Transaction Builder             |        |                                  |
|  (stellar-sdk, soroban-client)   |        |  Indexer Proxy / Cache Layer     |
|                                  |        |                                  |
|  Transaction Signer              |        |  Soroban RPC Proxy               |
|  (client-side only)              |        |                                  |
|                                  |        |  Mediator Account Factory        |
+----------------------------------+        +----------------------------------+
            |                                           |
            +-------------------+  +--------------------+
                                |  |
                    +-----------+--+----------+
                    |     Stellar Network      |
                    |  Indexer  |  Soroban RPC |
                    +-----------+--------------+
```

---

## 2. Frontend Architecture

### 2.1 Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR for initial load performance; static export compatible |
| Language | TypeScript 5.x | Type safety critical for transaction construction |
| Stellar SDK | `@stellar/stellar-sdk` 12.x | Official SDK; supports both classic and Soroban |
| Wallet integration | `@stellar/stellar-wallets-kit` | Unified interface across ecosystem wallets |
| State management | Zustand | Lightweight; suited for multi-step wizard state |
| UI components | Radix UI + Tailwind CSS | Accessible primitives; no opinionated styling lock-in |
| Package manager | Bun 1.x | Fast installs, built-in workspace support, native TypeScript runner |
| Testing | Bun test + Playwright | Unit and end-to-end |

### 2.2 Application State Machine

The demolish flow is modeled as an explicit finite state machine with the following states:

```
IDLE
  -> ANALYZING          (user submits source address)
  -> PREFLIGHT_COMPLETE (analysis done, plan displayed)
  -> SIGNER_SETUP       (multisig: gathering keys)
  -> STEP_EXECUTING     (a transaction step is in progress)
  -> STEP_CONFIRMED     (step confirmed on ledger)
  -> STEP_FAILED        (step failed; recovery options shown)
  -> COMPLETE           (merge confirmed; final receipt shown)
  -> ABORTED            (user cancelled or unrecoverable error)
```

Each state transition is logged to a local session store (IndexedDB) so that the user can close the browser and resume the session from the last confirmed step.

### 2.3 Transaction Builder Module

The transaction builder is a pure TypeScript module with no side effects. It accepts account state as input and produces a sequence of `TransactionEnvelope` objects as output. Each envelope is annotated with:

- `stepIndex`: position in the overall plan
- `stepDescription`: human-readable description of the operation
- `estimatedFee`: fee derived from simulation
- `dependencies`: indices of steps that must be confirmed before this step can be submitted

The builder validates that all operations in each envelope are within the 100-operation limit before returning.

### 2.4 Signing Flow

```
TransactionEnvelope
    |
    v
[stellar-wallets-kit]   OR   [Secret Key Input (in-memory only)]
    |                                |
    v                                v
SignedTransactionEnvelope  <---------+
    |
    v
[XDR preview modal - user confirms]
    |
    v
[Submit via Stellar RPC / Indexer]
    |
    v
[Poll for confirmation - max 30 seconds]
```

Secret keys entered in the advanced mode are stored only in component-local React state and are never written to `localStorage`, `sessionStorage`, `IndexedDB`, or transmitted to any server endpoint. The keys are cleared from memory on component unmount.

---

## 3. Backend Service

### 3.1 Technology Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Fastify 4.x |
| Language | TypeScript 5.x |
| Caching | Redis (30-second TTL for position data) |
| Ledger indexer | Custom indexer built on Galexie CDP + Captive Core |
| Deployment | Docker + Kubernetes (or equivalent managed container service) |

### 3.2 Endpoints

All endpoints are read-only. The backend performs no transaction construction, signing, or submission.

#### GET /v1/account/:address/analysis

Returns a complete account analysis including:

```json
{
  "address": "G...",
  "baseReserve": "1.0000000",
  "totalReserve": "4.5000000",
  "recoverableReserve": "4.5000000",
  "subentries": {
    "trustlines": [...],
    "offers": [...],
    "dataEntries": [...],
    "signers": [...]
  },
  "sponsorships": {
    "sponsoring": [...],
    "sponsoredBy": "G... | null"
  },
  "multisig": {
    "thresholds": { "low": 1, "med": 1, "high": 1 },
    "extraSigners": []
  },
  "claimableBalances": [...],
  "defiPositions": { ... }
}
```

#### GET /v1/account/:address/positions

Proxies and caches the DeFi Position API response (OctoPos or Orion). Returns normalized position data across all supported protocols.

#### GET /v1/routing/convert

Accepts `fromAsset`, `toAsset`, and `amount`. Returns the best available conversion path using StellarExpert DEX aggregation and Aquarius routing, with estimated output amount and path hops.

#### GET /v1/mediator/status/:address

Checks whether a given destination address requires a mediator account for the merge. Returns `{ requiresMediator: boolean, reason: string }`.

#### POST /v1/mediator/prepare

Accepts the source address and destination address. Returns an unsigned transaction envelope (XDR) that creates and funds a temporary mediator account. The mediator is funded by the source account, not by the backend service.

### 3.3 DeFi Position API Adapter

The backend implements a thin adapter layer that normalizes responses from either OctoPos (Untangled Finance) or Orion (Daccred), both of which are RFP-funded DeFi Position Aggregation APIs. The adapter interface is:

```typescript
interface DefiPositionAdapter {
  getPositions(address: string): Promise<NormalizedPositions>;
  getProtocolStatus(): Promise<ProtocolStatus[]>;
}
```

The active adapter is configured via environment variable (`DEFI_API_PROVIDER=octopos|orion`). If the primary provider returns an error or stale data (staleness > 60 seconds), the adapter automatically falls back to the secondary provider. This ensures resilience against individual API outages.

### 3.4 Stellar Indexer

The Account Demolisher does not use Horizon, which is deprecated and no longer actively maintained by Stellar. Account state (balances, trustlines, open offers, data entries, signers, and sponsorship relationships) is sourced from a self-hosted Stellar Indexer that the team operates as part of the backend infrastructure.

The indexer is built on two components from Stellar's own toolchain:

**Captive Core (hot path).** Runs an embedded `stellar-core` process that streams real-time `LedgerCloseMeta` events. This is the primary source for current account state and transaction confirmation. Response latency for account queries is typically under 1 second.

**Galexie CDP (cold path).** Galexie is Stellar's Change Data Capture pipeline tool that exports ledger data to a long-term store (Google Cloud Storage buckets or equivalent). The indexer reads historical ledger data from Galexie for backfills and recovery after downtime.

The indexer exposes an internal REST API consumed only by the backend service. Its endpoints mirror the query patterns previously provided by Horizon (account details, trustlines, open offers, data entries, claimable balances) but are served entirely from the locally indexed state.

Transaction submission uses Stellar RPC's `sendTransaction` method rather than Horizon's transaction submission endpoint. Post-submission confirmation polling uses `getTransaction` via Stellar RPC.

| Concern | Source |
|---|---|
| Current account state | Captive Core (indexed, hot path) |
| Historical backfill / recovery | Galexie CDP (cold path) |
| Transaction submission | Stellar RPC (`sendTransaction`) |
| Transaction confirmation | Stellar RPC (`getTransaction`) |
| Soroban contract state reads | Stellar RPC (`getLedgerEntries`) |
| Soroban transaction simulation | Stellar RPC (`simulateTransaction`) |

### 3.5 Caching Strategy

| Data type | TTL | Invalidation |
|---|---|---|
| DeFi positions | 30 seconds | Address-keyed; explicit on user request |
| Routing paths | 15 seconds | None (routing is time-sensitive) |
| Account analysis | 10 seconds | Explicit on each user-initiated refresh |
| Mediator status | 5 minutes | None |

---

## 4. Demolish Execution Plan

The tool generates an ordered execution plan from the account analysis. The plan is deterministic given the same account state. Steps within a plan are sequenced to satisfy ledger constraints:

### Step 1: Signer normalization

Remove all extra signers and set thresholds to allow single-key authorization for all subsequent steps. This is always the first transaction if extra signers exist.

**Operations per transaction:** Up to 20 `SetOptions` operations (one per signer removal, plus threshold updates).

### Step 2: Data entry removal

Remove all `ManageData` entries. Batched at 100 operations per transaction.

**Operations per transaction:** Up to 100 `ManageData` (remove) operations.

### Step 3: Claimable balance claims (optional)

If the user selects any claimable balances to claim, they are claimed in this step. This step is skipped if no balances are selected.

**Operations per transaction:** Up to 10 `ClaimClaimableBalance` operations (limited to manage trustline state complexity).

### Step 4: DEX offer cancellation

Cancel all open classic DEX offers. Batched at 100 operations per transaction.

**Operations per transaction:** Up to 100 `ManageSellOffer` / `ManageBuyOffer` (set to 0 amount).

### Step 5: AMM and LP position withdrawal

Withdraw from all Aquarius and Soroswap LP positions via Soroban contract invocations. Each pool withdrawal is a separate transaction due to Soroban fee simulation requirements.

**Operations per transaction:** 1 `InvokeHostFunction` per pool withdrawal, with optional fee bump.

### Step 6: DeFi protocol exit (Blend, Phoenix Hub, FxDAO)

Exit all lending, borrowing, and CDP positions. The order within this step is enforced:

1. Repay all borrow positions (purchasing required repayment assets via path payment if needed).
2. Withdraw all supply positions.
3. Withdraw all backstop deposits.
4. Repay FxDAO CDP debt and reclaim XLM collateral.

Each protocol operation is a separate `InvokeHostFunction` transaction.

### Step 7: Asset conversion

Convert all non-target assets to the target base asset (XLM by default) using path payments. Each asset is converted in a separate transaction with a minimum-received guard derived from the routing query.

**Operations per transaction:** 1 `PathPaymentStrictSend` per asset.

### Step 8: Trustline removal

Remove all remaining trustlines. Any trustlines with residual non-zero balances are returned to their issuers via `Payment` (0 balance check) before removal, or the user is prompted to lower the conversion slippage and retry Step 7.

**Operations per transaction:** Up to 100 `ChangeTrust` (limit 0) operations.

### Step 9: Account merge

Merge the source account into the mediator (if required) or directly into the destination.

- If the destination requires a mediator: the mediator forwards all funds via `Payment` to the final destination.
- If the destination does not require a mediator: direct `AccountMerge` to the destination, with destination memo if required.

---

## 5. Mediator Account Flow

The mediator account pattern enables CEX compatibility:

```
Source Account
    |
    | AccountMerge (merges into mediator, transfers all XLM)
    v
Mediator Account (temporary)
    |
    | Payment (forwards all XLM to destination)
    v
Destination Address (CEX deposit address)
    |
    | (CEX credits user based on destination address + memo)
```

The mediator account is a standard Stellar account created by the tool during the prepare step. It is funded with the minimum balance (1 XLM) sourced from the user's account. After the merge and forward, the mediator retains 1 XLM (its own minimum reserve), which is disclosed to the user as a known cost of this flow.

If the user provides their own mediator key, the tool uses it directly. If not, the tool generates an ephemeral keypair in the browser, funds the mediator account via the source account, and uses the ephemeral key to sign the mediator's forward transaction. The ephemeral key is cleared from memory after the forward transaction is confirmed.

---

## 6. Local Development Setup

### Prerequisites

- Bun 1.x
- Redis (local or Docker)
- Docker (optional, for full stack)

### Installation

```bash
git clone https://github.com/acachete-labs/account-demolisher
cd account-demolisher
bun install
```

### Environment Variables

```bash
# Backend
STELLAR_INDEXER_URL=http://localhost:3002        # self-hosted Stellar Indexer
STELLAR_SOROBAN_RPC_URL=https://soroban-rpc.stellar.org
DEFI_API_PROVIDER=octopos                        # or "orion"
OCTOPOS_API_URL=https://stellar.untangled.finance
ORION_API_URL=https://orion.daccred.co
REDIS_URL=redis://localhost:6379
PORT=3001

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_NETWORK=mainnet                      # or "testnet"
```

### Running Locally

```bash
# Start backend
bun run --filter backend dev

# Start frontend
bun run --filter frontend dev
```

### Running with Docker Compose

```bash
docker compose up
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:3001`.
