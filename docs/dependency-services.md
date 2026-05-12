# Dependency Services

> **Draft.** OctoPos and Orion are concurrently funded projects whose APIs are still under active development. Integration details, endpoint paths, and supported protocols in this document are based on their published RFP submissions and are subject to change as both services mature.

## 1. Overview

The Account Demolisher depends on two external services that are being developed concurrently under the same RFP batch. Both are DeFi Position Aggregation APIs for the Stellar ecosystem. Rather than building an independent DeFi position indexer, the Account Demolisher treats these services as infrastructure dependencies, consistent with the RFP's intent that the Account Demolisher backend use "one of the DeFi position API RFP recipients."

The two candidate services are:

- **OctoPos** by Untangled Finance: a production-oriented DeFi position aggregator built on top of live infrastructure (Untangled Loop, Untangled Vault) already serving institutional users on Stellar mainnet.
- **Orion** by Daccred: a specification-first, ledger-pinned DeFi positions API with published correctness guarantees and a focus on deterministic replay and developer-grade documentation.

The Account Demolisher integrates both via an adapter interface, with OctoPos as the default primary provider and Orion as the automatic fallback. The active configuration is controlled by an environment variable and can be changed without a code deployment.

---

## 2. Adapter Interface

The adapter interface abstracts the differences between the two APIs behind a normalized contract. Both adapters implement the same `DefiPositionAdapter` interface:

```typescript
interface DefiPositionAdapter {
  readonly providerName: string;
  getPositions(address: string, options?: GetPositionsOptions): Promise<NormalizedPositions>;
  getProtocolStatus(): Promise<ProtocolStatus[]>;
  isAvailable(): Promise<boolean>;
}

interface GetPositionsOptions {
  network?: "mainnet" | "testnet";
  forceRefresh?: boolean;
}

interface NormalizedPositions {
  address: string;
  providerName: string;
  dataStalenessSeconds: number;
  lastIndexedLedger: number;
  attributionConfidence: "high" | "medium" | "low";
  protocols: NormalizedProtocolPositions[];
}

interface NormalizedProtocolPositions {
  protocolId: ProtocolId;
  protocolName: string;
  healthFactor: number | null;
  borrowLimit: string | null;
  positions: NormalizedPosition[];
}

type ProtocolId = "blend" | "aquarius" | "soroswap" | "phoenix" | "fxdao";

interface NormalizedPosition {
  type: "supply" | "borrow" | "lp" | "backstop" | "cdp";
  poolAddress: string;
  poolName: string | null;
  assetAddress: string;
  assetSymbol: string;
  currentValueUsd: string;
  depositValueUsd: string;
  borrowedValueUsd: string | null;
  currentReturn: string | null;
  yieldApy: string | null;
  borrowApy: string | null;
  healthFactor: number | null;
  shares: string | null;
  rawAmount: string | null;
  lockupEndsAtLedger: number | null;
}
```

The adapter layer normalizes field names, units, and precision so that the transaction builder is insulated from provider-specific response formats. Both adapters internally handle pagination, retries, and API key management.

---

## 3. OctoPos (Primary Provider)

### 3.1 Provider Summary

OctoPos is developed by Untangled Finance and is a production extension of the position tracking infrastructure already running inside Untangled Loop and Untangled Vault. It provides multi-protocol aggregation across Blend, Aquarius, Soroswap, Phoenix Hub, and FxDAO with a unified USD pricing engine and 60-second snapshot intervals.

**Base URL:** `https://stellar.untangled.finance` (production)

**Protocol Coverage:**
- Blend (supply, borrow, backstop, health factor, V1 and V2)
- Aquarius AMM (LP positions, AQUA rewards)
- Soroswap (LP positions)
- Phoenix Hub (LP positions)
- FxDAO (CDP vaults)

### 3.2 Integration Points

The Account Demolisher uses the following OctoPos endpoints:

| OctoPos Endpoint | Account Demolisher Usage |
|---|---|
| `GET /positions/:address/summary` | Pre-flight account analysis, total DeFi exposure |
| `GET /positions/:address/protocols` | Per-protocol position detail for plan construction |
| `GET /positions/:address/history` | Not used in the demolish flow; available for future features |
| `GET /protocols/stats` | Protocol availability check (health monitoring) |

### 3.3 Data Freshness Requirements

The Account Demolisher requires DeFi position data to be no more than 60 seconds stale at the time the execution plan is generated. This is because the plan is constructed from the position snapshot and older data may result in incorrect transaction parameters (wrong repayment amounts, incorrect LP share counts).

If OctoPos returns a `data_staleness_seconds` value greater than 60, the adapter marks the response as stale and triggers fallback to Orion. If Orion is also stale, the tool enters degraded mode.

### 3.4 Known Limitations

- FxDAO CDP vault enumeration in OctoPos relies on storage polling with a 60-second interval. Positions opened or closed in the last 60 seconds may not be reflected in the API response. The tool displays the data freshness timestamp so users can identify this scenario.
- Backstop Q4W countdown is displayed as remaining ledgers. The tool converts this to an estimated time using the current average ledger close time (5 seconds).
- OctoPos prices dTokens using a multi-source oracle strategy. The tool uses the `currentValueUsd` field from OctoPos for informational display only; the actual transaction amounts are derived from on-chain state read at the time of transaction construction, not from the API response.

---

## 4. Orion (Fallback Provider)

### 4.1 Provider Summary

Orion is developed by Daccred and provides a ledger-pinned DeFi positions API with deterministic replay, published correctness guarantees (snapshot fixture suite), and a focus on API infrastructure semantics (OpenAPI spec, versioned SDKs, CLI).

**Base URL:** `https://orion.daccred.co` (production)

**Protocol Coverage:**
- Blend (supply, borrow, backstop, health factor, V1 and V2)
- Aquarius AMM (LP positions)
- Soroswap (LP positions)
- FxDAO (CDP vaults)
- Phoenix Hub planned for future coverage

### 4.2 Integration Points

The Account Demolisher uses the following Orion endpoints:

| Orion Endpoint | Account Demolisher Usage |
|---|---|
| `GET /v1/users/:address/positions` | Pre-flight analysis and plan construction |
| `GET /v1/users/:address/activities` | Not used in the demolish flow |
| `GET /v1/health` | Provider availability check |

### 4.3 Orion-Specific Adapter Notes

Orion responses include `data_staleness_seconds`, `last_indexed_ledger`, `partial_result`, and `attribution_confidence` metadata fields. The adapter maps these fields directly to the normalized interface. The `partial_result` flag, when `true`, causes the adapter to emit a `PARTIAL_DATA` warning that is surfaced to the user in the plan view.

Orion's `attribution_confidence` field is mapped to the normalized `attributionConfidence` field. When Orion returns `attribution_confidence: "low"`, the Account Demolisher displays a notice that position data may be incomplete and recommends verifying open positions on the StellarExpert or Smoothie explorers before proceeding.

### 4.4 Known Limitations

- Phoenix Hub coverage in Orion is planned but not confirmed in the initial tranche deliverables. When Phoenix positions cannot be retrieved from either provider, the tool displays a manual-check notice for Phoenix Hub positions.
- Orion's FxDAO adapter uses storage polling. Data freshness constraints are the same as OctoPos.
- The Soroswap Protocol 22 SDK incompatibility (affecting `simulateTransaction`) is handled inside the Orion adapter using a raw JSON-RPC workaround. The normalized position data returned is unaffected.

---

## 5. Fallback and Degraded Mode Logic

```
Request received for address positions
        |
        v
Query OctoPos (5-second timeout)
        |
        +-- Success, staleness <= 60s --> Return OctoPos data
        |
        +-- Success, staleness > 60s --> Log stale warning, trigger fallback
        |
        +-- Error or timeout -----------> Trigger fallback
                                                |
                                                v
                                    Query Orion (5-second timeout)
                                                |
                                    +-- Success, staleness <= 60s --> Return Orion data
                                    |
                                    +-- Success, staleness > 60s --> Enter degraded mode
                                    |
                                    +-- Error or timeout -----------> Enter degraded mode
```

In degraded mode:
- Classic Stellar operations proceed normally.
- The `defiPositions` field in the analysis response is set to `{ "error": "unavailable", "protocols": [] }`.
- The plan view shows a warning banner explaining that DeFi positions could not be loaded.
- Steps that depend on DeFi position data are marked as "manual verification required" with links to the relevant protocol dashboards.
- The user can acknowledge the warning and proceed with classic steps only.

---

## 6. Contract Registry Dependency

Both OctoPos and Orion maintain protocol-specific contract address registries. The Account Demolisher also maintains its own registry for the subset of contract addresses needed by the transaction builder (pool contracts used for withdrawal calls). This registry is stored as a JSON file in the repository and is loaded at service startup.

The registry format is:

```json
{
  "version": "2026-05-12",
  "mainnet": {
    "blend": {
      "pools": [
        {
          "address": "CAAAA...BLEND",
          "name": "USDC-XLM",
          "wasmHash": "abc123...",
          "version": "2"
        }
      ]
    },
    "aquarius": {
      "router": "CAAAA...AQUARIUS",
      "pools": [...]
    }
  },
  "testnet": { ... }
}
```

The registry is updated by a maintainer pull request whenever a protocol deploys a new version. An unknown wasm hash detected at position-query time causes the affected adapter to emit a `VERSION_UNKNOWN` warning, and the corresponding position is flagged in the plan view as requiring manual action.

---

## 7. SLA and Availability Expectations

The Account Demolisher's backend does not guarantee position data availability beyond what the underlying DeFi position APIs provide. The expected availability of the dependency services, as stated in their respective RFP submissions, is:

| Service | Stated SLA |
|---|---|
| OctoPos (Tranche 3) | 99.5% uptime |
| Orion (Tranche 3) | 99% load test success rate |

Given these SLAs, the dual-provider fallback strategy ensures that DeFi position data is unavailable only when both providers simultaneously experience an outage. The probability of this is significantly lower than either provider's individual downtime rate.

The Account Demolisher does not establish formal contractual SLAs with OctoPos or Orion. Availability monitoring is handled by the backend health check endpoint (`GET /v1/health`), which reports the real-time status of both providers.
