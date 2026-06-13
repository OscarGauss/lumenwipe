/**
 * End-to-end test of the v1 public API on TESTNET.
 *
 * It funds a fresh source and a destination wallet, then drives the stateless
 * loop the API is designed for: POST /plan, build the next step's unsigned XDR
 * via /plan/step, sign locally, submit, and repeat as the plan shrinks - ending
 * with the source account merged into the destination. Also checks input
 * validation and CORS.
 *
 * Requires the app running against testnet:
 *
 *   APP_URL=http://localhost:3000 bun scripts/test-public-api-flow.ts
 */
import { Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";

const APP = process.env.APP_URL || "http://localhost:3000";
const HORIZON = "https://horizon-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";
const PASSPHRASE = Networks.TESTNET;

type HzAccount = { sequence: string; balances: Array<{ asset_type: string; balance: string }> };
type PlanStep = { index: number; type: string };
type PlanResponse = { executable: boolean; blockers: { message: string }[]; steps: PlanStep[] };
type BuildStepResponse = { xdr: string; type: string };

const log = (s: string) => process.stdout.write(s + "\n");

async function fund(pub: string): Promise<void> {
  const r = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(pub)}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
async function load(id: string): Promise<HzAccount | null> {
  const r = await fetch(`${HORIZON}/accounts/${id}`);
  return r.ok ? ((await r.json()) as HzAccount) : null;
}
function native(a: HzAccount): string {
  return a.balances.find((b) => b.asset_type === "native")!.balance;
}
async function submit(xdr: string) {
  const r = await fetch(`${HORIZON}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: xdr }),
  });
  return { ok: r.ok, body: (await r.json()) as { successful?: boolean; hash?: string } };
}
async function postPlan(path: string, body: unknown): Promise<Response> {
  return fetch(`${APP}/api/v1/testnet/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const source = Keypair.random();
const dest = Keypair.random();

log(`App:    ${APP}`);
log(`Source: ${source.publicKey()}`);
log(`Dest:   ${dest.publicKey()}\n`);

log("Funding source + destination via friendbot...");
await fund(source.publicKey());
await fund(dest.publicKey());
const srcAcc0 = (await load(source.publicKey()))!;

// ── Validation + CORS smoke checks ─────────────────────────────────────────────
const badRes = await postPlan("plan", { account: "not-an-address", destination: dest.publicKey() });
const badBody = (await badRes.json()) as { error?: string };
log(
  badRes.status === 400 && badBody.error === "invalid_account"
    ? "[validation] ✓ invalid account rejected (400)"
    : `[validation] ✗ expected 400 invalid_account, got ${badRes.status} ${JSON.stringify(badBody)}`
);
const preflight = await fetch(`${APP}/api/v1/testnet/plan`, { method: "OPTIONS" });
log(
  preflight.headers.get("access-control-allow-origin") === "*"
    ? "[cors] ✓ preflight returns Access-Control-Allow-Origin: *"
    : "[cors] ✗ missing CORS header"
);

// ── Stateless wind-down loop ───────────────────────────────────────────────────
const reqBody = { account: source.publicKey(), destination: dest.publicKey() };
const destBefore = native((await load(dest.publicKey()))!);
const srcBalance = native(srcAcc0);

log("\n[loop] Driving the wind-down...");
let guard = 0;
let merged = false;
while (guard++ < 10) {
  const planRes = await postPlan("plan", reqBody);
  if (planRes.status === 404 && merged) {
    // The source account was closed by the MERGE step - nothing left to plan.
    break;
  }
  if (!planRes.ok) {
    log(`  ✗ /plan failed (HTTP ${planRes.status}): ${await planRes.text()}`);
    process.exit(1);
  }
  const plan = (await planRes.json()) as PlanResponse;
  if (!plan.executable) {
    log(`  ✗ plan not executable: ${plan.blockers.map((b) => b.message).join("; ")}`);
    process.exit(1);
  }
  if (plan.steps.length === 0) break;

  const next = plan.steps[0];
  const stepRes = await postPlan("plan/step", { ...reqBody, stepIndex: next.index });
  if (!stepRes.ok) {
    log(`  ✗ /plan/step failed (HTTP ${stepRes.status}): ${await stepRes.text()}`);
    process.exit(1);
  }
  const { xdr } = (await stepRes.json()) as BuildStepResponse;

  const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE);
  tx.sign(source);
  const res = await submit(tx.toEnvelope().toXDR("base64"));
  if (!res.ok || !res.body.successful) {
    log(`  ✗ submit failed for ${next.type}: ${JSON.stringify(res.body)}`);
    process.exit(1);
  }
  log(`  ✓ ${next.type} submitted (${res.body.hash})`);

  // MERGE closes the source account; there is nothing left to plan after it.
  if (next.type === "MERGE") {
    merged = true;
    break;
  }
}

// ── Verify ──────────────────────────────────────────────────────────────────────
const srcAfter = await load(source.publicKey());
const destAfter = native((await load(dest.publicKey()))!);
const recovered = parseFloat(destAfter) - parseFloat(destBefore);

log("\nResults:");
log(`  source: ${srcAfter ? "STILL EXISTS ✗" : "deleted ✓"}`);
log(`  dest:   ${destBefore} → ${destAfter}  (+${recovered.toFixed(7)})`);

const pass = !srcAfter && recovered > parseFloat(srcBalance) - 0.01;
log(
  pass
    ? "\n✅ E2E PASS - API drove the full wipe+merge; source closed, dest recovered the balance."
    : "\n❌ E2E FAIL - see results above."
);
process.exit(pass ? 0 : 1);
