# Requirements

> **Draft.** Requirements will be validated against actual Stellar protocol behaviour during development. Individual items may be revised, split, or reprioritized as implementation reveals new constraints.

## 1. Background and Motivation

Stellar currently hosts over ten million accounts on the mainnet ledger, a significant portion of which are stale, abandoned, or effectively locked due to inaccessible reserves. The minimum balance requirement (1 XLM base reserve) combined with per-entry reserves (0.5 XLM per trustline, offer, data entry, and signer) creates a long-tail of frozen capital that users cannot recover without technical knowledge.

The problem has three distinct user populations:

**Individual users** who have moved to a new wallet or simply want to consolidate holdings. They face a multi-step manual process: close DEX offers, remove LP positions, exit DeFi protocols, sell non-XLM assets, remove trustlines, clear data entries, remove extra signers, and then execute the merge. Any step missed causes the merge transaction to fail silently.

**Custodial exchanges (CEXes)** that need to help users recover remaining funds. No major CEX supports the `ACCOUNT_MERGE` operation natively, which means the base reserve is permanently inaccessible unless the user acts through a third-party tool.

**DeFi protocol users** who have open positions across Blend, Aquarius, Soroswap, Phoenix Hub, or FxDAO. Existing tools, including the `stellar.expert/demolisher` reference implementation, have no Soroban support and cannot interact with these protocols.

The Account Demolisher addresses all three populations through a single, non-custodial, client-side-signed interface.

---

## 2. Functional Requirements

### 2.1 Pre-flight Account Analysis

The tool must perform a complete account inspection before any transaction is submitted. This analysis covers:

**Sponsorship check.** An account that sponsors reserves for other accounts (subentries) cannot be merged until all sponsored entries are cleared. The tool must identify all sponsored entries, display them to the user, and block the merge flow until the condition is resolved.

**Multisig detection.** The tool must read the account's current signature thresholds (low, medium, high) and identify all additional signers. If multiple signers are required to meet any threshold, the user must be informed before proceeding.

**Reserve inventory.** The tool must calculate the total recoverable reserve: the base reserve plus per-entry reserves for all trustlines, offers, data entries, and signers currently attached to the account.

**DeFi position scan.** By querying the DeFi Position API (OctoPos or Orion), the tool must identify and enumerate all open positions across supported protocols: Blend supply/borrow, Aquarius LP stakes, Soroswap LP positions, Phoenix Hub positions, FxDAO CDP vaults, and any additional protocols added in future updates.

**Allowance inspection.** The tool must expose a read-only mode that lets users view all active token allowances granted to Soroban contracts, without initiating any account modification. This allows users to audit and revoke potentially dangerous allowances independently of the full demolish flow.

### 2.2 Signature Management

**Remove extra signers.** Before any irreversible operation, the tool must construct and submit a transaction that removes all additional signers from the account and adjusts the low, medium, and high thresholds to 0/1/1 so that the source key alone can authorize all subsequent transactions.

**Multisig gathering.** For accounts where multiple signers are still required, the interface must support adding multiple secret keys locally or connecting multiple wallets sequentially via stellar-wallets-kit. The tool must collect enough signatures to meet thresholds before broadcasting.

**Transaction envelope review.** Users must be able to inspect the XDR of any transaction before it is signed and submitted.

### 2.3 Data Entry Removal

The tool must enumerate all `ManageData` entries on the account and construct a transaction that removes them. If there are more than 100 entries, the removals must be batched across multiple transactions.

### 2.4 Claimable Balance Management

The tool must display all claimable balances where the account is a claimant. Users must be given the option to claim selected balances before proceeding. The tool must handle expiry conditions and return appropriate errors for balances that cannot be claimed.

### 2.5 Position Unwinding

**Classic DEX offers.** All open `ManageSellOffer` and `ManageBuyOffer` positions must be cancelled. The tool must batch these into as few transactions as possible, respecting the 100-operation limit per transaction.

**AMM / LP positions.** All Automated Market Maker pool stakes on Aquarius must be withdrawn. For each pool, the tool must calculate the current withdrawal amounts and construct the appropriate Soroban invocation.

**DeFi protocol positions.** Through integration with the DeFi Position API, the tool must:
- Exit all Blend supply positions, repay all Blend borrow positions (purchasing the required asset if needed), and withdraw all Blend backstop deposits.
- Withdraw all Aquarius liquidity positions.
- Remove all Soroswap LP positions.
- Withdraw all Phoenix Hub positions.
- Repay or unwind all FxDAO CDP vaults (paying down USDx debt and recovering XLM collateral).

The tool must handle sequencing correctly: borrow repayment must precede collateral withdrawal; backstop withdrawals may be subject to lock-up periods that the user must be informed about.

### 2.6 Asset Conversion

After all positions are unwound, the account may hold multiple classic and Soroban tokens. The tool must:

- Use Stellar DEX path payments (classic) or Soroban-based DEX routing (for Soroban tokens) to convert all balances to XLM, or to a user-specified base asset.
- Use the best-available routing at the time of conversion, querying the StellarExpert DEX aggregator and/or Aquarius routing for optimal paths.
- Give the user the option to skip conversion and instead forward non-XLM balances directly to a third-party wallet or exchange address.
- Display estimated slippage and a minimum-received amount before each conversion transaction.

### 2.7 Trustline Removal

After conversion, all non-XLM trustlines must be removed. If any non-zero balance remains on a trustline after conversion (e.g., due to slippage limits), the tool must offer the user the choice to return the balance to the issuer or to lower the conversion slippage tolerance and retry.

### 2.8 Account Merge

The final operation merges the account, transferring all remaining XLM (including recovered reserves) to the destination address.

**Destination compatibility.** Because CEXes do not support `ACCOUNT_MERGE`, the tool must use a temporary mediator account. The flow is:
1. The tool creates (or the user provides) a temporary funded mediator account.
2. The source account performs `ACCOUNT_MERGE` into the mediator.
3. The mediator forwards all received funds to the final destination address via `Payment`.

The tool must make this flow transparent to the user and must clearly indicate whether a mediator is needed based on the destination address type.

**Destination memo.** If the destination is an exchange or anchor address, the tool must prompt for a transaction memo and validate that it is present before submitting.

### 2.9 Dry-Run and Preview Mode

Because the full wind-down typically requires multiple sequential transactions, a complete pre-execution simulation of every step is not feasible. The tool must instead provide:

**Step-by-step plan view.** Before any transaction is submitted, the tool must display a complete ordered list of all planned operations: which positions will be unwound, what assets will be converted, what the estimated fee cost is for each step, and the estimated final XLM balance to be received.

**Per-step preflight simulation.** For each transaction, the tool must invoke Stellar's `simulateTransaction` (Soroban RPC) or `checkTransaction` (classic) to validate the transaction will succeed before prompting for signature. Any simulation failure must be surfaced to the user with a clear explanation.

**Partial execution recovery.** If execution is interrupted after some steps have completed, the tool must be able to re-scan the account on re-entry and resume from the correct step, skipping operations that are already complete.

---

## 3. Non-Functional Requirements

### 3.1 Trust Minimization

All transaction signing must occur on the client side. Secret keys must never leave the user's browser or local process. The backend service must not accept, store, or transmit private keys or signed transaction envelopes that include private key material.

### 3.2 Non-Custodial Architecture

The tool must not hold user funds at any point in the process. The temporary mediator account, if created by the tool, must be funded by the user's source account and must have no independent custody arrangement.

### 3.3 Open Source

The full source code, including frontend, backend service, smart contract interaction layer, and test suite, must be published under a permissive open-source license (Apache 2.0 or MIT) in a public repository before the final tranche delivery.

### 3.4 Wallet Compatibility

The frontend must support connection via stellar-wallets-kit, which covers Freighter, Albedo, xBull, LOBSTR, and other ecosystem wallets. It must also support direct secret key input for users who require it (advanced mode, with appropriate warnings). For multisig accounts, it must support adding multiple secret keys or sequentially connecting multiple wallets to accumulate signatures.

### 3.5 Irreversibility Safeguards

Every destructive action must be preceded by a confirmation screen that:
- Explicitly states what will happen and that the action cannot be undone.
- Displays the affected balance, position, or entry.
- Requires active user acknowledgment (not a pre-checked checkbox).

The tool must not auto-submit any transaction. The user must explicitly trigger each submission.

### 3.6 Error Handling and Recovery

All Stellar Indexer and Soroban RPC errors must be translated into human-readable messages. The tool must never display raw XDR or Stellar error codes to the user without explanation. Recoverable errors (network timeout, fee bump required) must offer a retry path. Non-recoverable errors must display a clear explanation and, where possible, a manual resolution path.

### 3.7 Fee Transparency

The tool must display estimated transaction fees (in XLM) for each step before the user signs. For Soroban operations, fees must be derived from simulation results. The tool must not submit transactions with fees that exceed the user-visible estimate by more than 20%.

### 3.8 Performance

The pre-flight account analysis must complete within 10 seconds for accounts with up to 500 entries and 10 open DeFi positions. Soroban position queries that depend on the DeFi Position API must complete within 5 seconds under normal network conditions.

### 3.9 Accessibility and Browser Support

The frontend must meet WCAG 2.1 AA accessibility standards. It must function correctly on current versions of Chrome, Firefox, and Safari on both desktop and mobile.
