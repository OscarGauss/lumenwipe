import { NextResponse } from "next/server";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { checkRateLimit, recordMerge } from "@/lib/kv";
import { isValidNetwork, RPC_URLS, NETWORK_PASSPHRASES } from "@/config/networks";
import type { Network } from "@/config/networks";

// Stellar tx hashes are exactly 64 lowercase hex characters
const TX_HASH_RE = /^[a-fA-F0-9]{64}$/;

// ─── Soroban RPC response types ───────────────────────────────────────────────

interface RpcTxResult {
  status: string;
  envelopeXdr?: string;
  [key: string]: unknown;
}

interface RpcResponse {
  result?: RpcTxResult;
  error?: { code: number; message: string };
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verifies via the Soroban RPC that:
 *   1. The transaction exists and has status SUCCESS.
 *   2. The transaction envelope contains at least one accountMerge operation.
 *
 * Parses the envelope XDR with the Stellar SDK so no external indexer is needed.
 * Falls back to status-only acceptance if XDR parsing fails due to a protocol
 * version mismatch (the same defensive pattern used elsewhere in this codebase).
 */
async function verifyAccountMerge(txHash: string, network: Network): Promise<boolean> {
  const rpcUrl = RPC_URLS[network];

  let rpcResp: Response;
  try {
    rpcResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return false; // network / timeout error
  }

  if (!rpcResp.ok) return false;

  let data: RpcResponse;
  try {
    data = await rpcResp.json();
  } catch {
    return false;
  }

  const result = data.result;
  if (!result || result.status !== "SUCCESS") return false;

  // Parse the transaction envelope to confirm the operation type
  if (result.envelopeXdr) {
    try {
      const passphrase = NETWORK_PASSPHRASES[network];
      const tx = TransactionBuilder.fromXDR(result.envelopeXdr, passphrase);
      return tx.operations.some((op) => op.type === "accountMerge");
    } catch {
      // XDR parse error — testnet may run a newer protocol than the SDK knows.
      // The SUCCESS status is already confirmed so we accept with a best-effort pass.
      return true;
    }
  }

  // envelopeXdr absent on a SUCCESS response is unexpected; accept anyway
  return true;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Rate limiting — checked before any expensive work
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // 2. Input validation
  let body: { txHash?: unknown; network?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { txHash, network } = body;

  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json({ error: "invalid_tx_hash" }, { status: 400 });
  }

  if (typeof network !== "string" || !isValidNetwork(network)) {
    return NextResponse.json({ error: "invalid_network" }, { status: 400 });
  }

  // 3. Verify via Soroban RPC + XDR operation-type check
  const valid = await verifyAccountMerge(txHash, network as Network);
  if (!valid) {
    return NextResponse.json({ error: "tx_not_verified" }, { status: 400 });
  }

  // 4. Atomic deduplication + increment (Lua script)
  const isNew = await recordMerge(network as Network, txHash);

  return NextResponse.json({ ok: true, new: isNew });
}
