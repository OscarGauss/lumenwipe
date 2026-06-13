import { test, expect } from "bun:test";
import { Keypair } from "@stellar/stellar-sdk";
import { decidePlan, finalizePlan, toPlanSteps } from "@/lib/api/plan-decision";
import type { PlanDecision } from "@/lib/api/plan-decision";
import type { AccountState } from "@/types/account";

// A Coinbase entry from config/exchange-registry.json: requiresMediator + a
// required `text` memo. Used to exercise the exchange/memo branches.
const COINBASE = "GB5CLRWUCBQ6DFK2LR5ZMWJ7QCVEB3XKMPTQUYCDIYB4DRZJBEW6M26D";

const ACCOUNT = Keypair.random().publicKey();
const WALLET_DEST = Keypair.random().publicKey(); // not in the exchange registry

function makeAccount(overrides: Partial<AccountState> = {}): AccountState {
  return {
    address: ACCOUNT,
    network: "testnet",
    sequence: "1234567890",
    nativeBalanceLumens: "10.0000000",
    dataEntries: [],
    signers: [{ key: ACCOUNT, weight: 1, type: "ed25519_public_key" }],
    thresholds: { low: 0, med: 1, high: 1 },
    numSubEntries: 0,
    numSponsoring: 0,
    sponsoredBy: null,
    authImmutable: false,
    trustlines: [],
    openOffers: [],
    poolShares: [],
    claimableBalances: [],
    subEntryMismatch: false,
    ...overrides,
  };
}

const cleanDecision: PlanDecision = {
  mediatorRequired: false,
  requiresMemo: false,
  memo: null,
  memoType: null,
  preReadBlockers: [],
};

// ── decidePlan: validation ─────────────────────────────────────────────────

test("decidePlan › rejects an invalid source address", () => {
  const res = decidePlan({ account: "not-an-address", destination: WALLET_DEST }, "testnet");
  expect(res).toEqual({ ok: false, status: 400, error: "invalid_account" });
});

test("decidePlan › rejects an invalid destination address", () => {
  const res = decidePlan({ account: ACCOUNT, destination: "nope" }, "testnet");
  expect(res).toEqual({ ok: false, status: 400, error: "invalid_destination" });
});

test("decidePlan › rejects merging into the source account itself", () => {
  const res = decidePlan({ account: ACCOUNT, destination: ACCOUNT }, "testnet");
  expect(res).toEqual({ ok: false, status: 400, error: "destination_same_as_source" });
});

// ── decidePlan: memo handling for non-exchange destinations ─────────────────

test("decidePlan › plain wallet destination needs no mediator or memo", () => {
  const res = decidePlan({ account: ACCOUNT, destination: WALLET_DEST }, "testnet");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.decision.mediatorRequired).toBe(false);
  expect(res.decision.requiresMemo).toBe(false);
  expect(res.decision.memo).toBeNull();
  expect(res.decision.preReadBlockers).toHaveLength(0);
});

test("decidePlan › memo without a memoType is rejected", () => {
  const res = decidePlan({ account: ACCOUNT, destination: WALLET_DEST, memo: "hi" }, "testnet");
  expect(res).toEqual({ ok: false, status: 400, error: "missing_memo_type" });
});

test("decidePlan › malformed memo is rejected", () => {
  const res = decidePlan(
    { account: ACCOUNT, destination: WALLET_DEST, memo: "x".repeat(29), memoType: "text" },
    "testnet"
  );
  expect(res).toEqual({ ok: false, status: 400, error: "invalid_memo" });
});

test("decidePlan › a valid typed memo is accepted on a plain destination", () => {
  const res = decidePlan(
    { account: ACCOUNT, destination: WALLET_DEST, memo: "12345", memoType: "id" },
    "testnet"
  );
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.decision.memo).toBe("12345");
  expect(res.decision.memoType).toBe("id");
});

// ── decidePlan: exchange (mediator + required memo) ─────────────────────────

test("decidePlan › exchange destination requires the mediator flow", () => {
  const res = decidePlan({ account: ACCOUNT, destination: COINBASE }, "testnet");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.decision.mediatorRequired).toBe(true);
  expect(res.decision.requiresMemo).toBe(true);
  expect(res.decision.memoType).toBe("text");
});

test("decidePlan › missing exchange memo blocks rather than silently dropping", () => {
  const res = decidePlan({ account: ACCOUNT, destination: COINBASE }, "testnet");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  const memoBlockers = res.decision.preReadBlockers.filter((b) => /memo/i.test(b.message));
  expect(memoBlockers).toHaveLength(1);
});

test("decidePlan › a valid exchange memo clears the memo blocker", () => {
  const res = decidePlan(
    { account: ACCOUNT, destination: COINBASE, memo: "deposit-tag" },
    "testnet"
  );
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.decision.memo).toBe("deposit-tag");
  expect(res.decision.preReadBlockers.filter((b) => /memo/i.test(b.message))).toHaveLength(0);
});

// ── finalizePlan ────────────────────────────────────────────────────────────

test("finalizePlan › clean account yields a single MERGE step and no blockers", () => {
  const resolved = finalizePlan(makeAccount(), cleanDecision);
  expect(resolved.steps).toHaveLength(1);
  expect(resolved.steps[0].type).toBe("MERGE");
  expect(resolved.blockers).toHaveLength(0);
});

test("finalizePlan › surfaces planner blockers (sponsoring account)", () => {
  const resolved = finalizePlan(makeAccount({ numSponsoring: 2 }), cleanDecision);
  expect(resolved.blockers.length).toBeGreaterThan(0);
  expect(resolved.blockers.some((b) => /sponsoring/i.test(b.message))).toBe(true);
});

test("finalizePlan › merges pre-read blockers with planner blockers", () => {
  const decision: PlanDecision = {
    ...cleanDecision,
    preReadBlockers: [{ message: "pre-read blocker" }],
  };
  const resolved = finalizePlan(makeAccount(), decision);
  expect(resolved.blockers.some((b) => b.message === "pre-read blocker")).toBe(true);
});

// ── toPlanSteps ───────────────────────────────────────────────────────────────

test("toPlanSteps › strips execution-only fields and keeps affectedAsset", () => {
  // An account with a trustline balance produces a CONVERT_ASSETS step carrying
  // affectedAsset, plus a MERGE step.
  const asset = `USDC:${Keypair.random().publicKey()}`;
  const resolved = finalizePlan(
    makeAccount({
      trustlines: [
        {
          asset,
          balance: "5.0000000",
          authorized: true,
          issuer: asset.split(":")[1],
          code: "USDC",
        },
      ],
    }),
    cleanDecision
  );

  const dto = toPlanSteps(resolved.steps);
  const convert = dto.find((s) => s.type === "CONVERT_ASSETS");
  expect(convert?.affectedAsset).toBe(asset);

  for (const step of dto) {
    const keys = Object.keys(step);
    expect(keys).not.toContain("txXdr");
    expect(keys).not.toContain("status");
    expect(keys).not.toContain("txHash");
    expect(keys).not.toContain("error");
  }
});
