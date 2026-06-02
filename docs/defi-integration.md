# DeFi Protocol Integration

> **Draft.** Protocol contract addresses, ABIs, and integration patterns are subject to change as protocols deploy new versions. This document will be updated as protocol team coordination sessions occur during Tranche 2 development.

## 1. Overview

Full Soroban DeFi protocol support is the primary differentiator of this implementation relative to the existing `stellar.expert/demolisher` reference tool. The integration layer handles position detection, unwinding transaction construction, and sequencing for the following protocols:

| Protocol                 | Category               | Integration Source                   |
| ------------------------ | ---------------------- | ------------------------------------ |
| Blend Protocol (V1 + V2) | Lending / Borrowing    | OctoPos / Orion + Blend SDK          |
| Aquarius AMM             | Automated Market Maker | OctoPos / Orion + Aquarius contracts |
| Soroswap                 | Automated Market Maker | OctoPos / Orion + Soroswap contracts |
| Phoenix Hub              | Concentrated Liquidity | OctoPos / Orion + Phoenix contracts  |
| FxDAO                    | CDP Stablecoin         | OctoPos / Orion + FxDAO contracts    |
| Classic Stellar DEX      | Order Book DEX         | Stellar Indexer                      |

---

## 2. DeFi Position API Integration

The Account Demolisher integrates with one of two DeFi Position Aggregation APIs funded under the same RFP batch: OctoPos (Untangled Finance) and Orion (Daccred). Both APIs normalize multi-protocol position data for any Stellar address into a unified schema. The Account Demolisher uses these APIs to detect open positions and determine the sequencing and parameters needed to exit them.

### 2.1 Adapter Interface

```typescript
interface NormalizedPositions {
  address: string;
  lastIndexedLedger: number;
  dataStalenessSeconds: number;
  protocols: ProtocolPositions[];
}

interface ProtocolPositions {
  protocolId: "blend" | "aquarius" | "soroswap" | "phoenix" | "fxdao";
  positions: Position[];
  healthFactor?: number;
  borrowLimit?: number;
}

interface Position {
  type: "supply" | "borrow" | "lp" | "backstop" | "cdp";
  poolAddress: string;
  assetAddress: string;
  currentValueUsd: number;
  depositValueUsd: number;
  borrowedValueUsd?: number;
  shares?: string;
  rawAmount?: string;
}
```

### 2.2 Fallback Strategy

The adapter queries the primary API (OctoPos by default). If the response is stale by more than 60 seconds or the request fails, it falls back to the secondary API. If both fail, the tool enters degraded mode: classic Stellar entries (trustlines, offers, data entries) are processed normally, and the user is warned that DeFi position data is unavailable and must be manually reviewed.

---

## 3. Blend Protocol

### 3.1 Position Types

Blend supports three position types per pool:

- **Supply positions**: collateral deposited into a reserve, represented as bToken shares.
- **Borrow positions**: liability taken against deposited collateral, represented as dToken shares.
- **Backstop positions**: BLND/USDC deposits in the backstop module, with a 21-day lock-up queue.

### 3.2 Unwind Sequence

The order is critical. Attempting to withdraw collateral while a borrow position is open will fail.

1. Calculate the repayment amount for each borrow position. The amount is derived from the dToken-to-asset conversion using the current bToken:dToken exchange rate from the pool's reserve state.

2. If the account does not hold sufficient tokens to repay a borrow, construct a path payment to acquire the required asset. The routing query is sent to the backend routing endpoint before this transaction is constructed.

3. Submit the repay transaction for each borrow position (`InvokeHostFunction`: `Pool.repay(from, asset, amount)`).

4. After all borrows are repaid, withdraw all supply positions (`InvokeHostFunction`: `Pool.withdraw(from, asset, amount, to)`).

5. If a backstop withdrawal has been queued (Q4W countdown in progress), display the remaining lock-up time to the user and allow them to proceed with the rest of the demolish while the backstop lock expires. The tool does not block the merge on a pending backstop; it alerts the user that the backstop funds will remain inaccessible until after the merge, and that the user should claim them from a different account if possible.

### 3.3 Health Factor Constraint

When partially repaying a borrow, the tool must verify that the resulting health factor will remain above 1.0. The calculation uses the same formula as the Blend SDK:

```
health_factor = sum(collateral_i * collateral_factor_i) / sum(liability_i / liability_factor_i)
```

If partial repayment is not possible (health factor would remain below 1.0 after repayment due to other positions), the tool attempts a full repayment and surfaces an error if funds are insufficient.

### 3.4 Version Handling

Blend V1 and V2 use different SCALAR constants for bToken/dToken conversion. The pool's contract wasm hash is checked against a maintained registry to determine the pool version. An unknown wasm hash causes the adapter to halt with a version-unknown error rather than computing incorrect amounts.

---

## 4. Aquarius AMM

### 4.1 LP Position Detection

LP positions are identified by querying for LP token balances held by the account. LP tokens are minted by the Aquarius pool contracts and held as Soroban token balances.

### 4.2 Withdrawal Construction

For each LP position:

1. Query the pool contract for total shares (`get_total_shares()`), reserve amounts (`get_reserves()`), and the account's share balance.

2. Calculate the expected withdrawal amounts:

   ```
   withdrawal_a = (account_shares / total_shares) * reserve_a
   withdrawal_b = (account_shares / total_shares) * reserve_b
   ```

3. Apply a minimum-received tolerance (configurable, default 0.5%) to both amounts.

4. Construct the withdrawal transaction: `InvokeHostFunction` calling `Pool.withdraw(account, shares, min_a, min_b)`.

### 4.3 AQUA Rewards

If the account has unclaimed AQUA rewards in any pool, the tool offers to claim them before withdrawal. Claiming AQUA adds a trustline requirement if the account does not already hold AQUA; the tool handles this automatically and converts the AQUA to XLM in the subsequent asset conversion step.

---

## 5. Soroswap

### 5.1 Pair Enumeration

Soroswap LP positions are identified by querying the Soroswap factory contract for all known pairs (`all_pairs(i)`) and checking whether the account holds LP tokens (TokenShare) for any pair.

The factory contract enumerates approximately 174 pairs on mainnet. The tool queries the DeFi Position API first (which caches this enumeration); direct contract queries are used only if the API is unavailable.

### 5.2 Constant Product Math

Withdrawal amounts are calculated using the constant product formula:

```
share_fraction = account_lp_balance / total_lp_supply
withdrawal_token_0 = share_fraction * reserve_0
withdrawal_token_1 = share_fraction * reserve_1
```

Reserves are read from the pair's instance storage via `getLedgerEntries`.

### 5.3 Protocol 22 Compatibility

Soroswap contracts have a known incompatibility with the Protocol 22 `simulateTransaction` API. The transaction builder uses the raw JSON-RPC workaround (direct `invokeContract` encoding without SDK simulation) for Soroswap operations, consistent with the approach validated by the Orion team during their adapter development.

---

## 6. Phoenix Hub

### 6.1 Position Types

Phoenix Hub offers concentrated liquidity pools. Positions are held as LP shares in specific price-range buckets.

### 6.2 Integration

Phoenix Hub positions are enumerated via the DeFi Position API. Withdrawal transactions are constructed by invoking the Phoenix pool contract's `remove_liquidity` method with the full LP share balance.

The tool applies a minimum-received tolerance to both output tokens, consistent with the Aquarius flow.

---

## 7. FxDAO

### 7.1 CDP Vault Mechanics

FxDAO allows users to deposit XLM as collateral and mint USDx (a USD-pegged stablecoin). Closing an FxDAO position requires:

1. Repaying the outstanding USDx debt.
2. Withdrawing the XLM collateral.

If the account does not hold sufficient USDx to repay the debt, the tool must first acquire USDx via a DEX path payment.

### 7.2 Health Factor and Oracle

FxDAO uses a price oracle to determine the collateral ratio. The tool reads the current oracle price before constructing the repayment transaction to ensure the vault is not undercollateralized (which would prevent normal closure and require liquidation instead). If a vault is undercollateralized at the time of the demolish, the tool surfaces a clear error explaining that the position must be manually managed and cannot be closed automatically.

### 7.3 Vault Enumeration

Active vaults are enumerated via the FxDAO contracts' linked list data structure, polled at the storage level. The DeFi Position API handles this enumeration; the tool consumes the normalized position data from the API.

---

## 8. Classic Stellar DEX

Classic DEX offers are handled entirely through Stellar classic operations, with no Soroban involvement.

### 8.1 Offer Enumeration

All open offers for the source account are retrieved from the Stellar Indexer's account offers query.

### 8.2 Cancellation

Each offer is cancelled via a `ManageSellOffer` or `ManageBuyOffer` operation with `amount = 0`. Operations are batched at up to 100 per transaction.

### 8.3 Passive Offers

Passive sell offers (`CreatePassiveSellOffer`) are cancelled via `ManageSellOffer` with the same `offerId` and `amount = 0`.

---

## 9. Allowance Inspection Mode

Independently of the demolish flow, the tool provides a read-only mode to inspect active Soroban token allowances. This serves as a security utility for users who have approved token spending to DeFi contracts and want to audit or revoke those approvals.

### 9.1 Allowance Detection

For each Soroban token held by the account, the tool queries the token contract's `allowance(from, spender)` method for all known DeFi contract addresses (Blend pools, Aquarius pools, Soroswap pairs, Phoenix pools, FxDAO vault contract). Non-zero allowances are displayed to the user with the following information:

- Token name and symbol.
- Spender contract address and protocol name (if recognized).
- Approved amount.
- Expiry ledger (if set).

### 9.2 Allowance Revocation

The user can revoke selected allowances by setting the approved amount to 0. Each revocation is a separate `InvokeHostFunction` transaction (`token.approve(from, spender, 0, 0)`). This operation does not require the full demolish flow and can be performed at any time.
