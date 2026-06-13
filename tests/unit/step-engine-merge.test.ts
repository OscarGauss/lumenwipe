import { test, expect } from "bun:test";
import { Account, Keypair, Transaction } from "@stellar/stellar-sdk";
import { buildMediatorMergePaymentTx } from "@/lib/stellar/tx-builder/merge";
import { NETWORK_PASSPHRASES } from "@/config/networks";
import { BASE_FEE_STROOPS, STROOPS_PER_XLM } from "@/config/constants";

// The v1 /plan/step endpoint injects the live native balance it already read
// (StepBuildContext.liveNativeBalanceLumens) into this builder instead of the
// browser's relative account fetch. These tests pin the shape and amount that
// the injected balance produces - the exact invariants the mediator co-sign
// endpoint validates before signing.

const USER = Keypair.random().publicKey();
const MEDIATOR = Keypair.random().publicKey();
const EXCHANGE = Keypair.random().publicKey();
const PASSPHRASE = NETWORK_PASSPHRASES.testnet;

function buildFromBalance(balanceLumens: string, memo: string | null = null) {
  const account = new Account(USER, "1234567890");
  const xdr = buildMediatorMergePaymentTx(
    account,
    MEDIATOR,
    EXCHANGE,
    balanceLumens,
    memo,
    "testnet",
    memo ? "text" : null
  );
  return new Transaction(xdr, PASSPHRASE);
}

test("mediator merge › produces exactly [accountMerge → mediator, payment → destination]", () => {
  const tx = buildFromBalance("10.0000000");
  expect(tx.operations).toHaveLength(2);

  const [merge, payment] = tx.operations;
  expect(merge.type).toBe("accountMerge");
  if (merge.type !== "accountMerge") throw new Error("expected accountMerge op");
  expect(merge.destination).toBe(MEDIATOR);

  expect(payment.type).toBe("payment");
  if (payment.type !== "payment") throw new Error("expected payment op");
  expect(payment.source).toBe(MEDIATOR);
  expect(payment.destination).toBe(EXCHANGE);
  expect(payment.asset.isNative()).toBe(true);
});

test("mediator merge › forwards the injected balance minus a two-op fee buffer", () => {
  const tx = buildFromBalance("10.0000000");
  const payment = tx.operations[1];
  if (payment.type !== "payment") throw new Error("expected payment op");

  const feeBuffer = (2 * BASE_FEE_STROOPS) / STROOPS_PER_XLM;
  const expected = (10 - feeBuffer).toFixed(7);
  expect(payment.amount).toBe(expected);
});

test("mediator merge › applies the exchange memo when provided", () => {
  const tx = buildFromBalance("10.0000000", "deposit-tag");
  expect(tx.memo.value?.toString()).toBe("deposit-tag");
});
