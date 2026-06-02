# API Reference

> **Draft.** Endpoint paths, request parameters, and response schemas are subject to change before the first public release. Breaking changes will not be introduced within a released version.

## 1. Overview

The Account Demolisher backend exposes a read-only REST API. All transaction construction and signing occurs in the browser; the backend only provides data that informs the client-side transaction builder. No endpoint accepts private keys, signed transactions, or any sensitive material.

**Base URL:** `https://api.account-demolisher.stellar.xyz/v1`

**Protocol:** HTTPS only. HTTP requests receive a 301 redirect to the HTTPS equivalent.

**Content type:** All responses are `application/json`.

**Rate limiting:** 60 requests per minute per IP address. Rate limit headers are included in every response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1715530800
```

Requests that exceed the rate limit receive a `429 Too Many Requests` response.

---

## 2. Endpoints

### 2.1 Account Analysis

#### GET /v1/account/:address/analysis

Returns a complete pre-flight analysis of the given Stellar account. This is the primary endpoint used at the start of the demolish flow.

**Path parameters:**

| Parameter | Type   | Description                                              |
| --------- | ------ | -------------------------------------------------------- |
| `address` | string | Stellar account G-address (56 characters, starts with G) |

**Query parameters:**

| Parameter | Type   | Default   | Description            |
| --------- | ------ | --------- | ---------------------- |
| `network` | string | `mainnet` | `mainnet` or `testnet` |

**Example request:**

```
GET /v1/account/GABC...XYZ/analysis?network=mainnet
```

**Response schema:**

```json
{
  "address": "GABC...XYZ",
  "network": "mainnet",
  "analysisTimestamp": "2026-05-12T14:23:00Z",
  "lastLedger": 52831440,
  "baseReserve": "1.0000000",
  "totalReserve": "4.5000000",
  "recoverableReserve": "4.5000000",
  "nativeBalance": "12.4500000",
  "subentries": {
    "trustlines": [
      {
        "asset": "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        "balance": "250.0000000",
        "limit": "10000.0000000",
        "isAuthorized": true,
        "sponsoredBy": null
      }
    ],
    "offers": [
      {
        "offerId": "1234567",
        "selling": "USDC:GA5Z...",
        "buying": "native",
        "amount": "100.0000000",
        "price": "0.2500000",
        "isPassive": false
      }
    ],
    "dataEntries": [
      {
        "key": "config",
        "value": "base64encodedvalue",
        "sponsoredBy": null
      }
    ],
    "signers": [
      {
        "key": "GBCD...MNO",
        "weight": 1,
        "type": "ed25519_public_key"
      }
    ]
  },
  "sponsorships": {
    "sponsoring": [],
    "sponsoredBy": null
  },
  "multisig": {
    "thresholds": {
      "low": 1,
      "med": 2,
      "high": 2
    },
    "requiresMultisig": true,
    "minimumSignaturesRequired": 2
  },
  "claimableBalances": [
    {
      "id": "00000000...",
      "asset": "USDC:GA5Z...",
      "amount": "50.0000000",
      "claimant": "GABC...XYZ",
      "sponsor": null,
      "expiresAt": null,
      "canClaim": true
    }
  ],
  "defiPositions": {
    "source": "octopos",
    "dataStalenessSeconds": 12,
    "lastIndexedLedger": 52831438,
    "protocols": [...]
  },
  "mergeable": false,
  "mergeBlockers": [
    "Account has open DEX offers that must be cancelled first.",
    "Account has active trustlines that must be removed first."
  ]
}
```

**Error responses:**

| Status | Code                  | Description                                                             |
| ------ | --------------------- | ----------------------------------------------------------------------- |
| 400    | `INVALID_ADDRESS`     | The provided address is not a valid Stellar G-address                   |
| 404    | `ACCOUNT_NOT_FOUND`   | No account exists at the given address on the specified network         |
| 429    | `RATE_LIMITED`        | Rate limit exceeded                                                     |
| 502    | `INDEXER_UNAVAILABLE` | Stellar Indexer returned an error; retry with exponential backoff       |
| 504    | `DEFI_API_TIMEOUT`    | DeFi Position API did not respond within 5 seconds; analysis is partial |

When a `504` is returned, the response body still includes all non-DeFi fields. The `defiPositions` field contains `{ "source": null, "error": "timeout", "protocols": [] }`.

---

### 2.2 DeFi Positions

#### GET /v1/account/:address/positions

Returns normalized DeFi position data across all supported protocols. This endpoint is a cached proxy to the configured DeFi Position API (OctoPos or Orion).

**Path parameters:**

| Parameter | Type   | Description                    |
| --------- | ------ | ------------------------------ |
| `address` | string | Stellar G-address or C-address |

**Query parameters:**

| Parameter | Type    | Default   | Description                                      |
| --------- | ------- | --------- | ------------------------------------------------ |
| `network` | string  | `mainnet` | `mainnet` or `testnet`                           |
| `refresh` | boolean | `false`   | If `true`, bypass the cache and fetch fresh data |

**Response schema:**

```json
{
  "address": "GABC...XYZ",
  "source": "octopos",
  "dataStalenessSeconds": 8,
  "lastIndexedLedger": 52831440,
  "attributionConfidence": "high",
  "protocols": [
    {
      "protocolId": "blend",
      "protocolName": "Blend Protocol",
      "healthFactor": 1.84,
      "borrowLimit": "450.00",
      "positions": [
        {
          "type": "supply",
          "poolAddress": "CAAAA...BLEND",
          "poolName": "USDC-XLM",
          "assetAddress": "USDC:GA5Z...",
          "assetSymbol": "USDC",
          "currentValueUsd": "250.00",
          "depositValueUsd": "248.50",
          "currentReturn": "1.50",
          "yieldApy": "3.2",
          "shares": "249123456789"
        },
        {
          "type": "borrow",
          "poolAddress": "CAAAA...BLEND",
          "poolName": "USDC-XLM",
          "assetAddress": "native",
          "assetSymbol": "XLM",
          "currentValueUsd": "120.00",
          "borrowedValueUsd": "121.20",
          "borrowApy": "5.8",
          "shares": "12345678901"
        }
      ]
    }
  ]
}
```

---

### 2.3 DEX Routing

#### GET /v1/routing/convert

Returns the best available conversion path for a given asset pair and amount. Used by the transaction builder to determine path payment parameters.

**Query parameters:**

| Parameter   | Type   | Required | Description                                                    |
| ----------- | ------ | -------- | -------------------------------------------------------------- |
| `fromAsset` | string | Yes      | Asset code and issuer, e.g. `USDC:GA5Z...` or `native` for XLM |
| `toAsset`   | string | Yes      | Target asset, same format                                      |
| `amount`    | string | Yes      | Amount to convert (as a decimal string)                        |
| `network`   | string | No       | `mainnet` or `testnet` (default: `mainnet`)                    |

**Example request:**

```
GET /v1/routing/convert?fromAsset=USDC:GA5Z...&toAsset=native&amount=250.0000000
```

**Response schema:**

```json
{
  "fromAsset": "USDC:GA5Z...",
  "toAsset": "native",
  "sendAmount": "250.0000000",
  "estimatedReceiveAmount": "998.4230000",
  "minimumReceiveAmount": "993.4308850",
  "slippageTolerance": "0.005",
  "path": ["USDC:GA5Z...", "native"],
  "source": "stellar_dex",
  "queryLedger": 52831440,
  "queryTimestamp": "2026-05-12T14:23:01Z",
  "warning": null
}
```

The `minimumReceiveAmount` is calculated as `estimatedReceiveAmount * (1 - slippageTolerance)` and is used as the `dest_min` parameter in the `PathPaymentStrictSend` operation.

If no viable conversion path exists, the response returns:

```json
{
  "fromAsset": "TOKEN:GXXX...",
  "toAsset": "native",
  "sendAmount": "1.0000000",
  "estimatedReceiveAmount": null,
  "path": [],
  "source": null,
  "warning": "No conversion path found. You may need to return this asset to its issuer."
}
```

---

### 2.4 Mediator Account

#### GET /v1/mediator/check/:destinationAddress

Determines whether the given destination address requires a mediator account for the merge operation.

**Path parameters:**

| Parameter            | Type   | Description                                   |
| -------------------- | ------ | --------------------------------------------- |
| `destinationAddress` | string | The G-address where merged funds will be sent |

**Response schema:**

```json
{
  "destinationAddress": "GDEST...CEX",
  "requiresMediator": true,
  "reason": "Destination is a known exchange deposit address. Exchange addresses do not support ACCOUNT_MERGE. A temporary mediator account will be used to forward funds.",
  "knownExchange": "Kraken",
  "requiresMemo": true,
  "memoType": "text"
}
```

The `requiresMediator` field is `true` in two cases:

1. The destination is in the known exchange address registry maintained by the tool.
2. The destination does not exist on the ledger (creating the account via merge requires the merge to succeed but may fail silently at the CEX side).

#### POST /v1/mediator/prepare

Returns an unsigned transaction envelope that creates and funds the temporary mediator account. The mediator is funded by the source account, not the backend service.

**Request body:**

```json
{
  "sourceAddress": "GABC...XYZ",
  "destinationAddress": "GDEST...CEX",
  "mediatorAddress": "GMED...TMP",
  "network": "mainnet"
}
```

The `mediatorAddress` is the public key of the ephemeral keypair generated in the browser. The backend uses it only to construct the `CreateAccount` operation; it has no access to the corresponding private key.

**Response schema:**

```json
{
  "transactionXdr": "AAAA...base64encodedXDR",
  "fee": "100",
  "mediatorAddress": "GMED...TMP",
  "fundingAmount": "1.5000000",
  "description": "Creates mediator account GMED... and funds it with 1.5 XLM from source account."
}
```

---

### 2.5 Health Check

#### GET /v1/health

Returns the operational status of all backend components.

**Response schema:**

```json
{
  "status": "ok",
  "timestamp": "2026-05-12T14:23:00Z",
  "components": {
    "indexer": {
      "status": "ok",
      "latencyMs": 45,
      "lastLedger": 52831440,
      "ingestionLagSeconds": 2
    },
    "sorobanRpc": {
      "status": "ok",
      "latencyMs": 82
    },
    "defiApi": {
      "provider": "octopos",
      "status": "ok",
      "latencyMs": 120,
      "dataStalenessSeconds": 18
    },
    "defiApiFallback": {
      "provider": "orion",
      "status": "ok",
      "latencyMs": 145
    },
    "redis": {
      "status": "ok"
    }
  }
}
```

Component status values: `ok`, `degraded`, `unavailable`.

---

## 3. Error Response Format

All error responses follow a consistent schema:

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "No account was found at address GABC...XYZ on mainnet.",
    "details": null,
    "requestId": "req_8f2a3b4c"
  }
}
```

| Field       | Description                                                          |
| ----------- | -------------------------------------------------------------------- |
| `code`      | Machine-readable error code (uppercase, underscore-separated)        |
| `message`   | Human-readable description suitable for display to end users         |
| `details`   | Optional structured details, present for validation errors           |
| `requestId` | Unique identifier for this request, useful for support and debugging |

---

## 4. Common Error Codes

| Code                  | HTTP Status | Description                                                                  |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `INVALID_ADDRESS`     | 400         | The address parameter is not a valid Stellar G-address                       |
| `INVALID_ASSET`       | 400         | An asset parameter is malformed                                              |
| `INVALID_AMOUNT`      | 400         | An amount parameter is not a valid positive decimal                          |
| `ACCOUNT_NOT_FOUND`   | 404         | The account does not exist on the specified network                          |
| `BALANCE_NOT_FOUND`   | 404         | A referenced claimable balance does not exist                                |
| `RATE_LIMITED`        | 429         | Rate limit exceeded; retry after the timestamp in `X-RateLimit-Reset`        |
| `INDEXER_ERROR`       | 502         | Stellar Indexer returned an unexpected error                                 |
| `INDEXER_UNAVAILABLE` | 503         | Stellar Indexer is unreachable                                               |
| `DEFI_API_TIMEOUT`    | 504         | DeFi Position API (both primary and fallback) did not respond within timeout |
| `INTERNAL_ERROR`      | 500         | Unexpected internal server error; a `requestId` is always present            |

---

## 5. Versioning

The API uses URL versioning (`/v1/`). Breaking changes will be introduced under a new version prefix. Non-breaking additions (new fields in responses, new optional query parameters) may be introduced within a version. Removed or renamed fields, changed response types, or removed endpoints constitute breaking changes and require a new version.

The current version is `v1`. The version lifecycle and deprecation timeline will be published in the project repository.
