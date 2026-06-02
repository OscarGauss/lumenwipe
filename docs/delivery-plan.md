# Delivery Plan

> **Draft.** This delivery plan is subject to change. Tranche scope, acceptance criteria, timelines, and team allocation will be refined during project scoping and may be updated before and after award. All figures are estimates.

## 1. Overview

The project is delivered in three tranches. Each tranche produces a working, deployable artifact and has explicit acceptance criteria that can be independently verified. The tranches are cumulative: each one builds on the previous rather than replacing it.

| Tranche | Phase                | Duration       | Focus                                                          |
| ------- | -------------------- | -------------- | -------------------------------------------------------------- |
| 1       | MVP                  | Weeks 1 to 5   | Core classic operations, backend service, testnet deployment   |
| 2       | Soroban Integration  | Weeks 6 to 10  | Full DeFi protocol support, Soroban transaction builder        |
| 3       | Production Hardening | Weeks 11 to 14 | Security audit, production deployment, documentation, final UX |

---

## 2. Tranche 1: MVP

**Duration:** 5 weeks

**Focus:** A working end-to-end account demolisher for classic Stellar operations: signer removal, data entry clearing, DEX offer cancellation, asset conversion via path payment, trustline removal, and account merge. DeFi protocol support is excluded from this tranche. The backend service is deployed on testnet. The frontend is deployed at a public testnet URL.

### 2.1 Deliverables

- Backend service with account analysis, DEX routing, mediator check, and mediator prepare endpoints.
- Frontend application with account entry, plan view, step-by-step execution, and merge confirmation screens.
- stellar-wallets-kit integration (Freighter as primary wallet).
- Secret key advanced mode with appropriate warnings.
- Multisig support: signer collection, multi-key signing, threshold normalization step.
- Session recovery via IndexedDB.
- Claimable balance detection and optional claiming.
- Testnet deployment at a public URL.
- Unit test suite covering transaction builder and state machine.
- Integration test suite for all classic operations against testnet.

### 2.2 Acceptance Criteria

| Criterion                  | Measurement                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classic operation coverage | All 7 classic steps (signer removal, data entry removal, offer cancellation, claimable balance claim, asset conversion, trustline removal, account merge) execute correctly on testnet |
| Multisig support           | An account with med threshold 2 and 2 extra signers can be demolished by providing both keys                                                                                           |
| Mediator flow              | A demolish into a destination account correctly uses the mediator flow when `requiresMediator: true` is returned by the backend                                                        |
| Session recovery           | A session interrupted after any step can be resumed correctly; completed steps are detected from on-chain state                                                                        |
| Error handling             | All Stellar Indexer and Soroban RPC error codes produce human-readable messages; no raw error codes or XDR strings are shown to the user                                               |
| Unit test coverage         | Transaction builder module has at least 80% line coverage                                                                                                                              |
| Integration tests passing  | All testnet integration tests pass in CI                                                                                                                                               |
| Testnet deployment live    | Frontend and backend are publicly accessible on testnet                                                                                                                                |

### 2.3 Out of Scope for Tranche 1

- Soroban DeFi protocol positions (Blend, Aquarius, Soroswap, Phoenix Hub, FxDAO).
- Soroban token conversion.
- Allowance inspection mode.
- Mainnet deployment.
- Security audit.

---

## 3. Tranche 2: Soroban and DeFi Integration

**Duration:** 5 weeks

**Focus:** Full Soroban support. This tranche adds DeFi position detection (via OctoPos and Orion integration), position unwinding for all five supported protocols, Soroban token conversion, and the allowance inspection utility.

### 3.1 Deliverables

- DeFi Position API adapter with OctoPos as primary and Orion as fallback.
- Blend position detection and unwind: supply withdrawal, borrow repayment (with auto-acquisition via path payment), backstop withdrawal (with lock-up period handling).
- Aquarius LP position detection and withdrawal.
- Soroswap LP position detection and withdrawal (with Protocol 22 raw RPC workaround).
- Phoenix Hub position detection and withdrawal.
- FxDAO CDP vault detection and closure (with debt repayment and collateral reclaim).
- Soroban token allowance detection and revocation (Inspect Allowances mode).
- Soroban token conversion via Aquarius routing.
- Per-step simulation via `simulateTransaction` before signing.
- Updated plan view showing DeFi position steps.
- Extended integration tests for all DeFi protocols on testnet.
- Extended end-to-end tests for Soroban flows on testnet.

### 3.2 Acceptance Criteria

| Criterion                 | Measurement                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Blend coverage            | Supply, borrow, and backstop positions are correctly detected, unwound, and confirmed on testnet                                  |
| Aquarius coverage         | LP positions are correctly detected and withdrawn on testnet                                                                      |
| Soroswap coverage         | LP positions detected via factory enumeration; withdrawal succeeds via raw RPC workaround                                         |
| Phoenix Hub coverage      | LP positions detected and withdrawn on testnet                                                                                    |
| FxDAO coverage            | CDP vaults with XLM collateral and USDx debt are correctly closed on testnet                                                      |
| DeFi API fallback         | Disabling the OctoPos endpoint causes automatic fallback to Orion within 5 seconds; no user-visible interruption                  |
| Allowance inspection      | Active allowances granted to known DeFi contract addresses are detected and displayed; revocation transactions succeed on testnet |
| Soroban fee accuracy      | For all Soroban transactions, displayed fee estimate matches submitted fee within 20%                                             |
| Degraded mode             | Disabling both DeFi APIs causes the tool to enter degraded mode with a clear user warning; classic operations proceed unaffected  |
| Integration tests passing | All Soroban integration tests pass in CI on testnet                                                                               |

### 3.3 Protocol Coverage Notes

Protocol contract addresses change when new versions are deployed. The backend service maintains a versioned contract registry in a public JSON file in the repository. The registry is loaded at service startup and can be updated independently of a full service deployment. An unknown contract wasm hash causes the affected adapter to emit a `version_unknown` error and the corresponding step is flagged for manual review rather than causing the entire demolish to fail.

---

## 4. Tranche 3: Production Hardening

**Duration:** 4 weeks

**Focus:** Security audit, production infrastructure, performance validation, final documentation, and mainnet deployment.

### 4.1 Deliverables

- Security audit conducted through Stellar Audit Bank or equivalent vetted firm; all critical and high-severity findings remediated.
- Production mainnet deployment with custom domain.
- Content Security Policy, HSTS, and all transport security controls verified against production deployment.
- Performance benchmarks: account analysis within 5 seconds for accounts with up to 500 subentries; frontend initial load under 2 seconds on a 4G connection.
- Load testing: backend sustains 100 concurrent requests without timeout.
- Final UX review and polish based on user testing with at least 5 real Stellar users.
- Complete public documentation (this document set, published in the repository).
- Published `SECURITY_AUDIT.md` with audit findings and remediation status.
- Published `SECURITY.md` with responsible disclosure policy.
- Open-source repository made public under Apache 2.0 license.

### 4.2 Acceptance Criteria

| Criterion               | Measurement                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Security audit complete | Audit report delivered; all critical/high findings remediated; audit findings published                                     |
| Mainnet deployment      | Production frontend and backend are live and accessible at the canonical URL                                                |
| CSP verified            | No CSP violations in browser console on any user flow; `unsafe-eval` is absent from the policy                              |
| Performance: analysis   | Account analysis completes within 5 seconds for a testnet account with 500 subentries (measured in CI)                      |
| Performance: load test  | Backend sustains 100 concurrent requests to `/v1/account/:address/analysis` with zero timeouts over a 60-second run         |
| Open source             | Repository is public; Apache 2.0 license file is present; all documentation files are present                               |
| Mainnet end-to-end test | Manual verification: a real mainnet account (with minimal funds) is successfully demolished using the production deployment |
| Responsible disclosure  | `SECURITY.md` file is present and describes a clear process for reporting vulnerabilities                                   |

---

## 5. Post-Delivery

After the final tranche is delivered, the project enters a maintenance phase with the following commitments:

- Critical security vulnerabilities are patched within 7 days of disclosure.
- DeFi protocol contract registry is updated within 5 business days of a new protocol version deployment.
- New DeFi protocols supported by the DeFi Position API (OctoPos / Orion) are evaluated for integration on a quarterly basis.
- The open-source repository accepts community pull requests under the standard contribution guidelines published in `CONTRIBUTING.md`.
