# Security Model

> **Draft.** The security model described here represents the target design. The formal security audit (planned for Tranche 3) may identify additional requirements or recommend design changes. This document will be updated to reflect audit findings.

## 1. Threat Model

The Account Demolisher handles one of the most sensitive operations possible on Stellar: it constructs transactions that drain an account completely and irreversibly. This creates an unusually high-value target for attackers. The security model is built around the principle that no component other than the user's own machine should ever have the ability to sign a transaction.

### 1.1 Assets at Risk

| Asset | Value | Risk Vectors |
|---|---|---|
| Private key | Total account control | Interception, exfiltration, XSS, phishing |
| Signed transaction | One-time execution of plan | Relay attack, MITM, unauthorized broadcast |
| Account balance | XLM and all tokens | Destination tampering, slippage manipulation |
| Transaction memo | Required for CEX attribution | Tampering leading to lost funds at exchange |

### 1.2 Attacker Profiles

**Passive network attacker.** Can observe traffic between browser and backend. Mitigated by TLS; private keys are never transmitted.

**Compromised backend.** The backend service is fully compromised by an attacker. Because all signing occurs client-side and the backend only returns read-only data, a compromised backend cannot produce valid signed transactions. It can only return malicious routing suggestions or incorrect position data, which is mitigated by the user confirmation flows and on-chain simulation results shown in the UI.

**XSS attacker.** Injects malicious scripts into the frontend. The Content Security Policy (CSP) is set to disallow inline scripts and restrict allowed sources to the application's own origin and explicitly allowlisted CDN hashes. Secret keys entered in advanced mode are stored only in React component state and are cleared on component unmount.

**Supply chain attacker.** Compromises a dependency. Mitigated by dependency pinning (lockfile enforced in CI), Subresource Integrity (SRI) hashes for CDN assets, and regular automated dependency audits via Dependabot.

**Phishing attacker.** Clones the site to a lookalike domain. Mitigated by publishing the canonical deployment URL prominently in the official Stellar documentation and never asking users to enter keys on any URL other than the verified domain.

---

## 2. Key Handling

### 2.1 Wallet-Based Signing (Primary Path)

The primary signing path uses stellar-wallets-kit. In this path, private key material never enters the application at all. The wallet (Freighter, Albedo, xBull, etc.) receives the unsigned transaction XDR and returns the signed XDR. The application has no access to the underlying private key.

### 2.2 Secret Key Input (Advanced Mode)

For users who require direct key input (e.g., hardware-generated keys not in any wallet, or programmatic use), the application provides an advanced mode with the following constraints:

- The input field is of type `password` to prevent shoulder-surfing and disable browser history.
- The key is stored only in a React `useRef` (not `useState`, to avoid re-render diffing traces).
- The key is never written to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or any browser-persisted storage.
- The key is never included in any network request.
- The key is cleared from the ref immediately after each signing operation.
- The component that holds the key ref is unmounted (and therefore cleared) when the user navigates away from the signing step.
- A prominent warning is displayed explaining the risks of secret key entry and recommending wallet-based signing.

### 2.3 Multisig Key Accumulation

For multisig accounts, multiple keys may need to be entered sequentially. Each key is used to sign the current transaction envelope, and the partially-signed XDR is retained in memory only. Individual keys are cleared from memory immediately after their signature is applied. The fully-signed envelope is broadcast and then cleared from memory.

### 2.4 Ephemeral Mediator Keypair

When the tool generates an ephemeral keypair for the mediator account:

- The keypair is generated using `StellarSdk.Keypair.random()` in the browser.
- The private key is stored only in a local variable within the mediator preparation function scope.
- The keypair is used to sign the mediator's forward transaction immediately.
- The variable is explicitly set to `null` after signing and the function returns.
- The public key (mediator address) is logged to the session state for transparency and recovery purposes; the private key is not.

---

## 3. Transport Security

- All communication between the frontend and backend uses HTTPS with TLS 1.2 minimum (TLS 1.3 preferred).
- HTTP Strict Transport Security (HSTS) is set with a one-year max-age.
- All API responses include appropriate `Cache-Control` headers to prevent caching of sensitive account data by intermediary proxies.
- CORS policy on the backend allows only the canonical frontend origin.

---

## 4. Content Security Policy

The frontend sets the following CSP header:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'sha256-[hash]';
  style-src 'self' 'unsafe-inline';
  connect-src 'self'
    https://soroban-rpc.stellar.org
    https://*.untangled.finance
    https://orion.daccred.co;
  img-src 'self' data:;
  frame-ancestors 'none';
  form-action 'self';
```

The `unsafe-eval` directive is explicitly excluded. If any dependency requires it, that dependency is replaced or patched.

---

## 5. Confirmation and Irreversibility Controls

### 5.1 Multi-Step Confirmation

Each destructive step in the execution plan requires an explicit confirmation from the user. The confirmation screen displays:

- The exact operation type and affected entries.
- The current balance or position value that will be affected.
- An explicit warning that the action cannot be undone.
- The estimated transaction fee.
- The signed XDR in a collapsible panel (for technical users).

### 5.2 Global Cancellation

At any point before the merge step is submitted, the user can cancel the operation. Cancelled partial executions leave the account in a partially unwound state. The tool displays a recovery summary showing which steps have already been confirmed on-chain and which remain, and the user can resume or manually complete the remaining steps.

### 5.3 Destination Address Verification

Before the merge step, the destination address is displayed in full and the user must confirm it. The tool checks that the destination account exists on the ledger. If the destination does not exist, the tool warns the user that funds sent to a non-existent account via a direct payment will be rejected, and that a merge into a non-existent account will succeed (creating the account) only if the amount exceeds the minimum balance.

### 5.4 Memo Validation

If the destination address is identified as a known exchange or anchor address (via a maintained registry), the tool requires a memo before allowing submission. If the user proceeds without a memo to an exchange address, a blocking warning is shown explaining that the funds may be lost without the correct memo.

---

## 6. Audit Plan

### 6.1 Scope

The security audit covers:

- Frontend application: key handling, CSP, XSS surface, dependency integrity.
- Backend service: input validation, authentication bypass, data injection.
- Transaction construction logic: correctness of operation encoding, fee estimation, envelope handling.
- Mediator account flow: keypair generation, signing, cleanup.

### 6.2 Audit Timeline

The security audit is planned for completion before the final tranche delivery, concurrent with the production deployment preparation. The audit will be conducted through Stellar's Audit Bank program or an equivalent vetted security firm.

### 6.3 Remediation Policy

All critical and high-severity findings must be remediated before the production deployment is made public. Medium-severity findings must be remediated within 30 days of the audit report. All audit findings and their remediation status will be published in the repository's `SECURITY_AUDIT.md` file.

### 6.4 Responsible Disclosure

A `SECURITY.md` file will be included in the repository with a responsible disclosure policy and a contact email for reporting vulnerabilities. The project will maintain a 90-day disclosure window for reported issues before public disclosure.

---

## 7. Dependency Management

- All dependencies are pinned to exact versions in the lockfile.
- `bun audit` is run in CI on every pull request and blocks merges if critical or high-severity vulnerabilities are found.
- Dependabot is configured to open pull requests for dependency updates on a weekly cadence.
- No dependency may be added that requires `eval`, `new Function()`, or dynamic code execution.
- All third-party scripts (if any) must be loaded with Subresource Integrity (SRI) hashes.
