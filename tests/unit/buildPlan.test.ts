import { test, expect } from "bun:test";
import { Keypair } from "@stellar/stellar-sdk";
import { buildPlan } from "@/lib/stellar/tx-builder";
import type { AccountState } from "@/types/account";

const MASTER_KP = Keypair.random();
const EXTRA_KP = Keypair.random();
const MASTER = MASTER_KP.publicKey();
const EXTRA = EXTRA_KP.publicKey();

function makeAccount(overrides: Partial<AccountState> = {}): AccountState {
  return {
    address: MASTER,
    network: "testnet",
    sequence: "1234567890",
    nativeBalanceLumens: "10.0000000",
    dataEntries: [],
    signers: [{ key: MASTER, weight: 1, type: "ed25519_public_key" }],
    thresholds: { low: 0, med: 1, high: 1 },
    numSubEntries: 0,
    numSponsoring: 0,
    sponsoredBy: null,
    trustlines: [],
    openOffers: [],
    poolShares: [],
    subEntryMismatch: false,
    ...overrides,
  };
}

test("buildPlan › clean account → single MERGE step", () => {
  const { steps: plan } = buildPlan(makeAccount(), false);
  expect(plan).toHaveLength(1);
  expect(plan[0].type).toBe("MERGE");
});

test("buildPlan › mediatorRequired=true → single MERGE step (shared mediator)", () => {
  const { steps: plan } = buildPlan(makeAccount(), true);
  expect(plan).toHaveLength(1);
  expect(plan[0].type).toBe("MERGE");
});

test("buildPlan › MERGE step title reflects the exchange route when mediator required", () => {
  const { steps: plan } = buildPlan(makeAccount(), true);
  const mergeStep = plan.find((s) => s.type === "MERGE")!;
  expect(mergeStep.title.toLowerCase()).toContain("exchange");
});

test("buildPlan › MERGE step direct title when no mediator", () => {
  const { steps: plan } = buildPlan(makeAccount(), false);
  const mergeStep = plan.find((s) => s.type === "MERGE")!;
  expect(mergeStep.title).toBe("Merge account");
});

test("buildPlan › extra signer → first step is NORMALIZE_SIGNERS", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 1, type: "ed25519_public_key" },
      { key: EXTRA, weight: 1, type: "ed25519_public_key" },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  expect(plan[0].type).toBe("NORMALIZE_SIGNERS");
});

test("buildPlan › raised med threshold alone triggers NORMALIZE_SIGNERS", () => {
  const account = makeAccount({
    thresholds: { low: 0, med: 2, high: 2 },
  });
  const { steps: plan } = buildPlan(account, false);
  expect(plan[0].type).toBe("NORMALIZE_SIGNERS");
});

test("buildPlan › raised high threshold alone triggers NORMALIZE_SIGNERS", () => {
  const account = makeAccount({
    thresholds: { low: 0, med: 1, high: 2 },
  });
  const { steps: plan } = buildPlan(account, false);
  expect(plan[0].type).toBe("NORMALIZE_SIGNERS");
});

test("buildPlan › data entries → REMOVE_DATA_ENTRIES step", () => {
  const account = makeAccount({
    dataEntries: [
      { key: "key1", value: "dmFsdWU=" },
      { key: "key2", value: "dmFsdWU=" },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const step = plan.find((s) => s.type === "REMOVE_DATA_ENTRIES");
  expect(step).toBeDefined();
  expect(step!.operationCount).toBe(2);
});

test("buildPlan › 101 data entries → 2 REMOVE_DATA_ENTRIES batches", () => {
  const account = makeAccount({
    dataEntries: Array.from({ length: 101 }, (_, i) => ({ key: `k${i}`, value: "" })),
  });
  const { steps: plan } = buildPlan(account, false);
  const steps = plan.filter((s) => s.type === "REMOVE_DATA_ENTRIES");
  expect(steps).toHaveLength(2);
  expect(steps[0].operationCount).toBe(100);
  expect(steps[1].operationCount).toBe(1);
});

test("buildPlan › open offers → CANCEL_OFFERS step", () => {
  const account = makeAccount({
    openOffers: [
      { id: "1", selling: "native", buying: "USDC:GABC", amount: "100", price: "1.0" },
      { id: "2", selling: "native", buying: "BTC:GABC", amount: "10", price: "0.5" },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const step = plan.find((s) => s.type === "CANCEL_OFFERS");
  expect(step).toBeDefined();
  expect(step!.operationCount).toBe(2);
});

test("buildPlan › trustline with balance → CONVERT_ASSETS before REMOVE_TRUSTLINES", () => {
  const account = makeAccount({
    trustlines: [
      {
        asset: "USDC:GABC123",
        balance: "100.0",
        limit: "1000",
        authorized: true,
        issuer: "GABC123",
        code: "USDC",
      },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const convertIdx = plan.findIndex((s) => s.type === "CONVERT_ASSETS");
  const removeIdx = plan.findIndex((s) => s.type === "REMOVE_TRUSTLINES");
  expect(convertIdx).toBeGreaterThanOrEqual(0);
  expect(removeIdx).toBeGreaterThanOrEqual(0);
  expect(convertIdx).toBeLessThan(removeIdx);
});

test("buildPlan › CONVERT_ASSETS step includes affectedAsset", () => {
  const account = makeAccount({
    trustlines: [
      {
        asset: "USDC:GABC123",
        balance: "50.0",
        limit: "1000",
        authorized: true,
        issuer: "GABC123",
        code: "USDC",
      },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const step = plan.find((s) => s.type === "CONVERT_ASSETS");
  expect(step!.affectedAsset).toBe("USDC:GABC123");
});

test("buildPlan › trustline with zero balance → no CONVERT_ASSETS", () => {
  const account = makeAccount({
    trustlines: [
      {
        asset: "USDC:GABC123",
        balance: "0",
        limit: "1000",
        authorized: true,
        issuer: "GABC123",
        code: "USDC",
      },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const convertStep = plan.find((s) => s.type === "CONVERT_ASSETS");
  expect(convertStep).toBeUndefined();
});

test("buildPlan › trustline with zero balance → still has REMOVE_TRUSTLINES", () => {
  const account = makeAccount({
    trustlines: [
      {
        asset: "USDC:GABC123",
        balance: "0",
        limit: "1000",
        authorized: true,
        issuer: "GABC123",
        code: "USDC",
      },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const removeStep = plan.find((s) => s.type === "REMOVE_TRUSTLINES");
  expect(removeStep).toBeDefined();
});

test("buildPlan › step indices are sequential from 0", () => {
  const account = makeAccount({
    dataEntries: [{ key: "k1", value: "" }],
    openOffers: [{ id: "1", selling: "native", buying: "USDC:G", amount: "1", price: "1" }],
  });
  const { steps: plan } = buildPlan(account, false);
  plan.forEach((step, i) => {
    expect(step.index).toBe(i);
  });
});

test("buildPlan › all steps start with status 'pending'", () => {
  const account = makeAccount({
    dataEntries: [{ key: "k1", value: "" }],
    trustlines: [
      {
        asset: "USDC:GABC123",
        balance: "0",
        limit: "1000",
        authorized: true,
        issuer: "GABC123",
        code: "USDC",
      },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  expect(plan.every((s) => s.status === "pending")).toBe(true);
});

test("buildPlan › all steps have non-null estimatedFeeLumens", () => {
  const { steps: plan } = buildPlan(makeAccount(), false);
  expect(plan.every((s) => s.estimatedFeeLumens !== null)).toBe(true);
  expect(plan.every((s) => parseFloat(s.estimatedFeeLumens) > 0)).toBe(true);
});

test("buildPlan › all steps have txXdr=null initially", () => {
  const { steps: plan } = buildPlan(makeAccount(), false);
  expect(plan.every((s) => s.txXdr === null)).toBe(true);
});

test("buildPlan › complex account has all expected step types", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 1, type: "ed25519_public_key" },
      { key: EXTRA, weight: 1, type: "ed25519_public_key" },
    ],
    dataEntries: [{ key: "k1", value: "" }],
    openOffers: [{ id: "1", selling: "native", buying: "USDC:G", amount: "1", price: "1" }],
    trustlines: [
      {
        asset: "USDC:GABC123",
        balance: "50.0",
        limit: "1000",
        authorized: true,
        issuer: "GABC123",
        code: "USDC",
      },
    ],
  });
  const { steps: plan } = buildPlan(account, false);
  const types = plan.map((s) => s.type);
  expect(types).toContain("NORMALIZE_SIGNERS");
  expect(types).toContain("REMOVE_DATA_ENTRIES");
  expect(types).toContain("CANCEL_OFFERS");
  expect(types).toContain("CONVERT_ASSETS");
  expect(types).toContain("REMOVE_TRUSTLINES");
  expect(types).toContain("MERGE");
});

test("buildPlan › 5 trustlines with balance → 5 CONVERT_ASSETS steps + 1 REMOVE_TRUSTLINES", () => {
  const account = makeAccount({
    trustlines: Array.from({ length: 5 }, (_, i) => ({
      asset: `TK${i}:GABC${i}`,
      balance: "10.0",
      limit: "1000",
      authorized: true,
      issuer: `GABC${i}`,
      code: `TK${i}`,
    })),
  });
  const { steps: plan } = buildPlan(account, false);
  const convertSteps = plan.filter((s) => s.type === "CONVERT_ASSETS");
  const removeSteps = plan.filter((s) => s.type === "REMOVE_TRUSTLINES");
  expect(convertSteps).toHaveLength(5);
  expect(removeSteps).toHaveLength(1);
});

// ─── Signer type tests ───────────────────────────────────────────────────────

test("buildPlan › hash_x extra signer → NORMALIZE_SIGNERS step", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 1, type: "ed25519_public_key" },
      {
        key: "XHASH00000000000000000000000000000000000000000000000000000",
        weight: 1,
        type: "hash_x",
      },
    ],
  });
  const { steps } = buildPlan(account, false);
  expect(steps[0].type).toBe("NORMALIZE_SIGNERS");
});

test("buildPlan › preauth_tx extra signer → NORMALIZE_SIGNERS step", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 1, type: "ed25519_public_key" },
      {
        key: "TPREAUTH0000000000000000000000000000000000000000000000000",
        weight: 1,
        type: "preauth_tx",
      },
    ],
  });
  const { steps } = buildPlan(account, false);
  expect(steps[0].type).toBe("NORMALIZE_SIGNERS");
});

test("buildPlan › ed25519_signed_payload extra signer → NORMALIZE_SIGNERS step", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 1, type: "ed25519_public_key" },
      {
        key: "PSIGNEDPAYLOAD0000000000000000000000000000000000000000000000000000000000000",
        weight: 1,
        type: "ed25519_signed_payload",
      },
    ],
  });
  const { steps } = buildPlan(account, false);
  expect(steps[0].type).toBe("NORMALIZE_SIGNERS");
});

test("buildPlan › clean account → no blockers", () => {
  const { blockers } = buildPlan(makeAccount(), false);
  expect(blockers).toHaveLength(0);
});

test("buildPlan › master weight below high threshold → blocker, still has NORMALIZE_SIGNERS", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 1, type: "ed25519_public_key" },
      { key: EXTRA, weight: 5, type: "ed25519_public_key" },
    ],
    thresholds: { low: 0, med: 3, high: 5 },
  });
  const { steps, blockers } = buildPlan(account, false);
  expect(blockers).toHaveLength(1);
  expect(blockers[0].message).toContain("high threshold");
  // Steps still generated - UI decides whether to block execution
  expect(steps.some((s) => s.type === "NORMALIZE_SIGNERS")).toBe(true);
});

test("buildPlan › master weight meets high threshold → no threshold blocker", () => {
  const account = makeAccount({
    signers: [
      { key: MASTER, weight: 5, type: "ed25519_public_key" },
      { key: EXTRA, weight: 1, type: "ed25519_public_key" },
    ],
    thresholds: { low: 0, med: 3, high: 5 },
  });
  const { blockers } = buildPlan(account, false);
  expect(blockers).toHaveLength(0);
});

// ─── Task 1 & 2 blocker tests ────────────────────────────────────────────────

test("buildPlan › numSponsoring > 0 → blocker emitted", () => {
  const { blockers } = buildPlan(makeAccount({ numSponsoring: 2 }), false);
  expect(blockers.some((b) => b.message.includes("sponsoring"))).toBe(true);
});

test("buildPlan › numSponsoring = 0 → no sponsoring blocker", () => {
  const { blockers } = buildPlan(makeAccount({ numSponsoring: 0 }), false);
  expect(blockers.every((b) => !b.message.includes("sponsoring"))).toBe(true);
});

test("buildPlan › pool shares present → blocker emitted", () => {
  const account = makeAccount({
    poolShares: [{ poolId: "a".repeat(64) }],
  });
  const { blockers } = buildPlan(account, false);
  expect(blockers.some((b) => b.message.includes("pool"))).toBe(true);
});

test("buildPlan › no pool shares → no pool blocker", () => {
  const { blockers } = buildPlan(makeAccount(), false);
  expect(blockers.every((b) => !b.message.includes("pool"))).toBe(true);
});

test("buildPlan › subEntryMismatch → blocker emitted", () => {
  const { blockers } = buildPlan(makeAccount({ subEntryMismatch: true }), false);
  expect(blockers.some((b) => b.message.includes("entries that could not be enumerated"))).toBe(
    true
  );
});

test("buildPlan › subEntryMismatch false → no mismatch blocker", () => {
  const { blockers } = buildPlan(makeAccount({ subEntryMismatch: false }), false);
  expect(blockers.every((b) => !b.message.includes("enumerated"))).toBe(true);
});
