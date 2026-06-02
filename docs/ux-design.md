# UX Design

> **Draft.** This document reflects current thinking on user flows and interface design. Specific copy, layouts, and interaction patterns are subject to change based on user testing and feedback gathered during development.

## 1. Design Principles

The Account Demolisher performs irreversible financial operations. The UX must be designed from the ground up with this constraint as its primary constraint, not an afterthought.

**Clarity over brevity.** Every screen must fully describe what will happen, not just what the user is doing. A user who reads only the headings must still understand the consequence of confirming.

**No automatic progress.** The tool must never advance to the next step automatically. Every transition requires an explicit user action.

**Recoverable-first design.** Where the underlying operation is irreversible, the UX must create a recoverable checkpoint before it. Users must be able to pause, review, and resume at any stage.

**Progressive disclosure.** Advanced details (XDR, contract addresses, raw amounts) are always available but not shown by default. The primary view surfaces the information most users need; technical users can expand additional detail.

---

## 2. Application Structure

The tool is organized into three top-level sections accessible via a persistent navigation bar:

1. **Demolish Account:** the primary multi-step flow for closing an account.
2. **Inspect Allowances:** the standalone read-only utility for viewing and revoking Soroban token allowances.
3. **Resume Session:** visible only when a partially-completed demolish session is stored in the browser.

---

## 3. Demolish Flow: Step-by-Step

### Step 1: Account Entry

**What the user sees:**

A single-field form requesting the Stellar account address (G-address) to demolish. A secondary field for the destination address is shown below it. Network selection (mainnet / testnet) is available via a toggle in the top-right corner of the form.

**Wallet connection option:**

An alternative to manual address entry is provided via a "Connect Wallet" button that opens the stellar-wallets-kit modal. If the user connects a wallet, both the source address and the signing method are set automatically.

**Validation:**

- Source address must be a valid G-address.
- Source address must exist on the selected network (validated against the backend analysis endpoint).
- Destination address must be a valid G-address and must be different from the source address.

**User actions:**

- "Analyze Account": triggers the account analysis and advances to the plan view.

---

### Step 2: Account Analysis and Plan View

**What the user sees:**

After analysis completes (typically 3 to 8 seconds), the user sees a full plan overview organized into clearly labeled sections:

**Account Summary card:**

- Current balance in XLM.
- Number of subentries (trustlines, offers, data entries, signers).
- Estimated total recoverable reserve in XLM.
- Destination address with a "Change" link.

**Execution Plan list:**

Each planned step is shown as a numbered card with:

- Step title (e.g., "Remove extra signers", "Cancel 3 DEX offers", "Exit Blend borrow position").
- Estimated fee for this step.
- A brief description of the operation.

The steps are presented in the order they will be executed. Steps that depend on previous steps display a dependency notice.

**DeFi Positions panel:**

If DeFi positions were detected, they are shown in a dedicated panel with the protocol name, position type, and current value in USD. Each position shows whether it will be unwound automatically or requires manual action.

**Blockers panel:**

If any pre-flight checks failed (active sponsorships, unclaimable balances, undercollateralized vaults), they are shown as blocking items with a clear explanation and a link to the relevant section of the documentation.

**Claimable Balances panel:**

If any claimable balances were found, the user is shown a list with the asset, amount, and expiry. A checkbox allows the user to select which balances to claim as part of the flow.

**Total fee estimate:**

A summary at the bottom of the plan view shows the estimated total XLM cost in transaction fees across all steps, and the estimated final XLM amount that will arrive at the destination.

**User actions:**

- "Proceed with this plan": advances to the signer setup step.
- "Cancel": returns to the account entry screen with no changes made.

---

### Step 3: Signer Setup

This step only appears if the account requires multisig authorization.

**What the user sees:**

A clear statement of the account's current signature requirements:

- Current thresholds (low, medium, high).
- List of all authorized signers with their weights.
- The minimum number of signers required to authorize operations at the medium threshold.

Below this, a signer collection panel with one of two modes:

**Wallet mode:** A list of wallet connection slots, one per required signer. Each slot shows the signer address once a wallet is connected. Slots already satisfied by the wallet connected in Step 1 are pre-filled.

**Secret key mode:** A password-input field per required signer, with warnings about the risks of secret key entry.

**User actions:**

- "Continue": available only when enough signers have been connected to meet the medium threshold.
- "Cancel": returns to the plan view.

---

### Step 4: Step Execution

**What the user sees:**

The execution view shows the full plan list on the left side with the current step highlighted. The right side shows the active step in detail:

**Step detail panel:**

- Step title and description.
- The specific entries or positions that will be modified.
- Estimated fee in XLM.
- A "View XDR" button that expands the raw transaction XDR in a monospace code block (collapsed by default).

**Confirmation prompt:**

Before the user can sign, a confirmation statement must be read and acknowledged. For destructive steps, this statement uses direct language:

> "This action will permanently remove the USDC trustline from this account. The operation cannot be undone. Any remaining USDC balance will be lost if not converted first."

The user must click "I understand, proceed" to enable the signing button.

**Signing button:**

The signing button reads "Sign and Submit" and triggers the appropriate signing flow based on the method selected in Step 3.

**Progress indicator:**

After the user clicks "Sign and Submit," the button is replaced by a progress indicator showing "Submitting to Stellar network..." and then "Waiting for ledger confirmation..."

**On success:**

The step is marked as complete with a confirmation notice showing the transaction hash (linked to StellarExpert). The panel automatically advances to the next step with the next step's detail pre-loaded.

**On failure:**

The error is displayed in plain language with a suggested action. Common errors have specific messages:

- Insufficient fee: "The network fee was higher than estimated. Increase the fee tolerance and retry."
- Timeout: "The transaction was not confirmed within 30 seconds. You can safely retry; it has not been submitted to the ledger."
- Simulation failure: "The transaction simulation failed. [Reason translated from XDR]. Review the step details and contact support if the issue persists."

---

### Step 5: Merge Confirmation

The merge step is treated separately from the other steps because it is the most consequential and irreversible operation in the flow.

**What the user sees:**

A full-screen confirmation screen (not a panel) with:

- A prominent heading: "Final step: this account will be permanently closed."
- The source address.
- The destination address (highlighted; the user should verify this carefully).
- The destination memo (if required), with a warning if it is missing.
- The estimated final XLM amount to be received.
- A checkbox: "I have verified the destination address and I understand this action is irreversible."

The "Sign and Submit Merge" button is disabled until the checkbox is checked.

If a mediator account is required:

- The mediator flow is described in plain language: "Because the destination does not support ACCOUNT_MERGE, a temporary intermediary account will be used. Your funds will be transferred to the intermediary, and then forwarded to the destination in a separate transaction. The intermediary will retain 1 XLM as its minimum reserve."
- The mediator address is shown so the user can verify on a block explorer if desired.

---

### Step 6: Completion Receipt

**What the user sees:**

A receipt screen with:

- "Account successfully closed" heading.
- The merge transaction hash (linked to StellarExpert).
- The mediator forward transaction hash (if a mediator was used).
- Total XLM received at destination.
- Total fees paid across all steps.
- A prompt to bookmark or screenshot the page, as this information will not be retrievable after the browser session ends.

---

## 4. Allowance Inspection Mode

Accessible from the main navigation as "Inspect Allowances." This mode does not modify the account.

**What the user sees:**

An address entry field (or wallet connection button). On submission, the tool queries all known DeFi contract addresses for active allowances on each Soroban token held by the account.

**Results view:**

A table showing:

- Token name and symbol.
- Spender contract address and recognized protocol name (if known).
- Approved spending amount.
- Expiry ledger and estimated expiry date.

Each row has a "Revoke" button. Clicking it opens a confirmation modal and, if confirmed, submits a revocation transaction (`token.approve(from, spender, 0, 0)`).

---

## 5. Session Recovery

If the user has a partially completed session (stored in IndexedDB), a "Resume Session" banner appears at the top of the home screen. Clicking it restores the plan view with completed steps greyed out and the next pending step highlighted.

The session includes:

- Source and destination addresses.
- Network.
- Completed step indices and their transaction hashes.
- The current step's signed XDR (if signing was completed but submission failed).

The session does not include private keys or signed transaction material beyond the current step.

---

## 6. Error States

### Account Inaccessible

If the account cannot be loaded (indexer timeout, network error), the error is shown inline with a "Retry" button. The user is not redirected.

### Partial DeFi Data

If the DeFi Position API is unavailable, the plan view displays a warning banner:

> "DeFi position data is currently unavailable. Classic Stellar entries (trustlines, offers, data entries) have been loaded correctly. Open DeFi positions (Blend, Aquarius, etc.) could not be detected. You may proceed, but please manually verify that you have no open DeFi positions before merging."

### Step Execution Failure

If a step fails after submission, the plan view enters an interrupted state. The failed step is highlighted in red with the error message and a "Retry" button. No subsequent steps are available until the current step succeeds.

### Merge Prerequisite Failure

If a new blocker is detected during execution (e.g., a claimable balance became claimable mid-flow, or a DeFi position was opened from another session), the plan view re-runs the pre-flight analysis and updates the plan. The user is shown what changed and must acknowledge the updated plan before continuing.

---

## 7. Accessibility

- All interactive elements are keyboard navigable.
- All form fields have associated labels.
- Error messages are announced via `aria-live` regions.
- Color is never used as the sole differentiator for status (success, warning, error states use icons in addition to color).
- Minimum contrast ratio of 4.5:1 for all text (WCAG 2.1 AA).
- The confirmation checkboxes and acknowledge buttons use `role="checkbox"` and `role="button"` with appropriate `aria-label` attributes.
- All modals trap focus and return focus to the triggering element on close.
