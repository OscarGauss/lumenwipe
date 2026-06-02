# Test Strategy

> **Draft.** This document reflects current thinking and is subject to change as implementation decisions are finalized and new edge cases are discovered during development.

## 1. Overview

Testing an account demolisher requires particular care because the operations under test are irreversible and involve real financial balances. The test strategy is organized into four tiers:

1. **Unit tests:** pure logic, no network, no keys.
2. **Integration tests:** real Stellar Indexer and Soroban RPC on testnet.
3. **Adversarial and edge-case tests:** deliberately malformed inputs, network failures, partial states.
4. **End-to-end tests:** automated browser flows on testnet using real funded accounts.

All four tiers run in CI on every pull request. Integration and end-to-end tests run against Stellar testnet only. Mainnet is never touched in automated testing.

---

## 2. Unit Tests

Unit tests verify pure logic: transaction construction, fee estimation, balance calculations, routing, state machine transitions, and input validation. All Stellar Indexer and Soroban RPC calls are replaced with deterministic fixtures.

### 2.1 Transaction Builder

| Test case                                                         | Expected outcome                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Build signer removal transaction for account with 3 extra signers | Transaction contains 3 `SetOptions` (signer remove) + 3 `SetOptions` (threshold set); total operations = 6             |
| Build signer removal for account with 95 extra signers            | Transaction is split into batches of 100 operations; all signers are removed across N transactions                     |
| Build data entry removal for account with 250 data entries        | 3 transactions of 100, 100, and 50 operations respectively                                                             |
| Build DEX offer cancellation for 0 open offers                    | No transaction is produced for this step; step is marked as a no-op                                                    |
| Build path payment for USDC to XLM with a known routing response  | `PathPaymentStrictSend` uses the path from the routing fixture; `dest_min` equals estimated output multiplied by 0.995 |
| Build trustline removal for asset with zero balance               | `ChangeTrust` operation with limit 0 is produced                                                                       |
| Build trustline removal for asset with non-zero balance           | Builder rejects the transaction and returns a `BALANCE_REMAINING` error                                                |
| Build `AccountMerge` with a destination that exists               | Direct merge transaction is produced                                                                                   |
| Build mediator flow for destination requiring mediator            | Two-transaction plan is produced: source merges into mediator, mediator pays destination                               |
| Batch 150 operations across two transactions                      | First transaction has 100 operations, second has 50                                                                    |

### 2.2 Fee Estimation

| Test case                                                                  | Expected outcome                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Estimate fee for a 1-operation classic transaction at base fee 100 stroops | Returns 100 stroops                                                        |
| Estimate fee for a Soroban simulation with known resource consumption      | Returns the sum of inclusion fee and resource fee from simulation response |
| Fee from simulation exceeds 20% of displayed estimate                      | UI flag is raised; user is warned before signing                           |

### 2.3 Balance and Reserve Calculations

| Test case                                                         | Expected outcome                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Account with 4 trustlines, 2 offers, 1 data entry, 1 extra signer | Total reserve = 1 + (4 + 2 + 1 + 1) \* 0.5 = 5 XLM              |
| Account with no subentries                                        | Total reserve = 1 XLM; recoverable reserve = 1 XLM              |
| Account with 2 sponsored subentries                               | Sponsored entries do not count toward the account's own reserve |

### 2.4 State Machine

| Test case                                                                  | Expected outcome                                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Transition from `ANALYZING` to `PREFLIGHT_COMPLETE` on successful analysis | State is `PREFLIGHT_COMPLETE`; plan is populated                            |
| Transition from `STEP_EXECUTING` to `STEP_FAILED` on indexer error         | State is `STEP_FAILED`; error message is set; completed steps are preserved |
| Attempt transition from `STEP_FAILED` to `STEP_EXECUTING` on retry         | Transition is allowed; same step index is re-executed                       |
| Transition from `COMPLETE` to any other state                              | Transition is rejected; `COMPLETE` is a terminal state                      |

### 2.5 Input Validation

| Test case                                        | Expected outcome                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| G-address with 55 characters                     | `INVALID_ADDRESS` error                                                  |
| G-address starting with M (muxed address)        | `INVALID_ADDRESS` error with note that muxed addresses are not supported |
| Source address equals destination address        | Validation error: source and destination must differ                     |
| Asset string without issuer (e.g., `USDC` alone) | `INVALID_ASSET` error                                                    |
| Asset string with invalid issuer                 | `INVALID_ASSET` error                                                    |

---

## 3. Integration Tests

Integration tests run against Stellar testnet with real funded accounts created at the start of each test suite run using the testnet friendbot. They verify that the tool correctly reads account state from the Stellar Indexer, constructs valid transactions, and receives confirmations via Stellar RPC.

### 3.1 Account Analysis

| Test case                                          | Setup                                           | Expected outcome                                                 |
| -------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Account with no subentries                         | Freshly funded testnet account                  | Analysis returns empty trustlines, offers, data entries, signers |
| Account with 5 trustlines                          | Add 5 trustlines via testnet transactions       | Analysis returns 5 trustlines with correct assets and balances   |
| Account with 3 open DEX offers                     | Create 3 offers                                 | Analysis returns 3 offers with correct selling/buying assets     |
| Account with 2 extra signers and raised thresholds | `SetOptions` to add signers                     | Analysis returns `requiresMultisig: true`, correct thresholds    |
| Account with 1 sponsored subentry                  | Create sponsored trustline from sponsor account | Analysis returns sponsorship information correctly               |
| Account with active claimable balance              | Create claimable balance                        | Analysis returns the balance in `claimableBalances`              |

### 3.2 Signer Removal

| Test case                                     | Expected outcome                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Account with 2 extra signers, med threshold 2 | After step execution, account has 1 signer (master key), thresholds 0/1/1 |
| Signing with wrong key weight                 | Transaction rejected by Stellar; error is surfaced correctly              |

### 3.3 DEX Offer Cancellation

| Test case                         | Expected outcome                                |
| --------------------------------- | ----------------------------------------------- |
| Account with 3 open sell offers   | After step execution, account has 0 open offers |
| Account with 1 passive sell offer | After step execution, offer is cancelled        |
| Account with 0 open offers        | Step is a no-op; no transaction is submitted    |

### 3.4 Trustline Removal

| Test case                                | Expected outcome                                                  |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Account with USDC trustline, balance = 0 | Trustline removed; account has no USDC trustline                  |
| Account with USDC trustline, balance > 0 | Builder surfaces `BALANCE_REMAINING` error; step is not submitted |

### 3.5 Asset Conversion

| Test case                                             | Expected outcome                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Account with 100 USDC, path exists to XLM             | Path payment succeeds; account has 0 USDC and increased XLM balance         |
| Account with 1 unit of illiquid token, no path to XLM | Builder returns `NO_PATH` error; user is offered option to return to issuer |

### 3.6 Account Merge

| Test case                                                            | Expected outcome                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Direct merge to an existing testnet account with no memo requirement | Merge succeeds; source account no longer exists; destination balance increased                         |
| Mediator flow to a destination that does not natively support merge  | Merge to mediator succeeds; mediator forward payment succeeds; final balance at destination is correct |

### 3.7 DeFi Position API Integration

| Test case                                               | Expected outcome                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Primary API (OctoPos) returns valid positions           | Positions are displayed in the plan view                                |
| Primary API returns HTTP 503                            | Fallback to Orion API is triggered; positions are loaded from Orion     |
| Both APIs return HTTP 503                               | Degraded mode is activated; warning is displayed; classic flow proceeds |
| Primary API returns stale data (staleness > 60 seconds) | Fallback to Orion API is triggered                                      |

---

## 4. Adversarial and Edge-Case Tests

This tier deliberately constructs unusual or malicious account states to verify that the tool handles them safely.

### 4.1 Account State Edge Cases

| Edge case                                                                | Expected behavior                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Account sponsors reserves for 3 other accounts                           | Pre-flight analysis detects sponsorships; merge is blocked; clear explanation is shown                        |
| Account is sponsored by another account                                  | Analysis displays the sponsor; tool proceeds normally; sponsor is not affected by the merge                   |
| Account has maximum subentries (1000)                                    | Analysis, plan construction, and execution handle batching correctly across all 1000 entries                  |
| Account has a trustline to a revoked asset (authorization revoked)       | Trustline is identified; `ChangeTrust` removal is constructed; deauthorization is not required before removal |
| Account has a data entry with a key that is 64 characters long (maximum) | Data entry is removed correctly                                                                               |
| Account was created with an initial sequence number of 1 (new account)   | Sequence number handling is correct; no off-by-one errors in transaction construction                         |

### 4.2 Network Failure Scenarios

| Failure scenario                                                                        | Expected behavior                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Stellar Indexer returns a timeout on analysis                                           | Error shown with retry button; no state is changed                                                            |
| Stellar RPC confirms a transaction but the connection drops before the response arrives | On retry, the tool detects the transaction is already confirmed via `getTransaction`; step is marked complete |
| Transaction is submitted but fee is too low                                             | `tx_insufficient_fee` error is translated to a human-readable message; user can increase fee and retry        |
| Soroban RPC simulation fails for a DeFi position withdrawal                             | Step is flagged with the simulation error; user is given the option to skip this step and proceed manually    |
| Network fork during step execution                                                      | Tool detects the ledger closed without the transaction; re-submits with updated sequence number               |

### 4.3 Partial Execution and Recovery

| Scenario                                       | Expected behavior                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User closes browser after step 3 of 7          | On return, session is restored; steps 1-3 are shown as complete; execution resumes at step 4                                                               |
| User resumes session on a different device     | Session cannot be restored (IndexedDB is per-device); user must re-enter address and restart analysis; tool re-detects completed steps from on-chain state |
| Account state changed externally between steps | Analysis is re-run before each step; if the step is now a no-op (e.g., a trustline was removed externally), it is skipped                                  |

### 4.4 Multisig Edge Cases

| Edge case                                            | Expected behavior                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account requires 3 of 5 signers; only 2 are provided | "Continue" button in signer setup remains disabled; explanation of required vs. provided weight is shown                                               |
| Account has a pre-auth transaction signer            | Pre-auth signer is listed and must be removed; tool constructs the removal correctly                                                                   |
| Account has a hash(x) signer                         | Hash(x) signer is listed; tool provides a note that it cannot sign with hash(x) signers automatically and the user must provide the pre-image manually |

### 4.5 DeFi Position Adversarial Cases

| Edge case                                                                                      | Expected behavior                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blend borrow position is undercollateralized at time of unwind                                 | Tool detects health factor < 1.0; step is blocked; user is warned that the position is at risk of liquidation                                                                          |
| FxDAO vault requires more USDx than the account holds, and no DEX path to acquire USDx exists  | Tool surfaces an error: "Cannot close FxDAO vault: insufficient USDx and no conversion path available. You must manually acquire USDx to repay this debt."                             |
| Blend backstop withdrawal is in Q4W cooldown with 10 days remaining                            | User is informed of the lock-up; tool proceeds with remaining steps; merge is blocked until backstop is resolved (or user chooses to leave backstop funds behind with a clear warning) |
| Aquarius LP withdrawal results in less than the minimum received amount (high slippage moment) | Transaction fails simulation; tool retries with lower minimum-received amount and re-presents confirmation to user                                                                     |

---

## 5. End-to-End Tests

End-to-end tests use Playwright to drive a real browser session against the deployed testnet environment. Each test uses a dedicated funded testnet account created at test start.

### 5.1 Happy Path

- Fund a testnet account.
- Add 2 trustlines (USDC and a custom asset).
- Create 1 open sell offer.
- Add 1 data entry.
- Run the demolish flow from account entry through to merge.
- Verify via the testnet Stellar Indexer that the source account no longer exists and the destination balance increased by the expected amount.

### 5.2 Multisig Path

- Fund a testnet account.
- Add 2 signers with weights 1 and 1; set med threshold to 2.
- Add 1 trustline.
- Run the demolish flow; provide both secret keys in the signer setup step.
- Verify the account is merged successfully.

### 5.3 CEX Destination Path (Mediator Flow)

- Fund a testnet account.
- Run the demolish flow with a destination that is flagged as requiring a mediator.
- Verify that the mediator account is created, the merge occurs into the mediator, and the forward payment delivers funds to the final destination.

### 5.4 Session Recovery

- Fund a testnet account with 3 trustlines and 2 data entries.
- Run steps 1 and 2 of the demolish flow; close the browser session.
- Re-open the application; verify the session is recovered.
- Complete the remaining steps; verify the account is merged.

### 5.5 Allowance Inspection

- Fund a testnet account.
- Grant a token allowance to a mock contract address.
- Open the Inspect Allowances view; verify the allowance is detected.
- Revoke the allowance; verify on-chain that the allowance is zero.

---

## 6. Test Infrastructure

| Component               | Tooling                         |
| ----------------------- | ------------------------------- |
| Package manager         | Bun 1.x                         |
| Unit test runner        | Bun test (built-in)             |
| Browser end-to-end      | Playwright                      |
| Testnet account funding | Stellar Friendbot API           |
| CI platform             | GitHub Actions                  |
| Code coverage           | Bun built-in coverage reporter  |
| Test fixtures           | JSON files in `tests/fixtures/` |

Coverage thresholds enforced in CI: 80% line coverage for the transaction builder module, 70% overall. Coverage falling below these thresholds blocks the pull request.

All integration and end-to-end tests use isolated testnet accounts per test run. Testnet accounts are created at the start of each test and are not reused across runs. No shared testnet accounts are used.
