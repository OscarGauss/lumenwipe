import { NextResponse } from "next/server";
import { recordMerge } from "@/lib/kv";
import { seGet } from "@/lib/se-api/client";
import { isValidNetwork } from "@/config/networks";
import type { Network } from "@/config/networks";

// Stellar tx hashes are 64 hex characters
const TX_HASH_RE = /^[a-fA-F0-9]{64}$/;

interface SeTransactionResp {
  successful?: boolean;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  // --- Parse and validate body ---
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

  // --- Verify the transaction exists and succeeded on stellar.expert ---
  let tx: SeTransactionResp;
  try {
    tx = await seGet<SeTransactionResp>(network as Network, `/tx/${txHash}`);
  } catch {
    // stellar.expert returned 4xx/5xx or timed out — treat as not found
    return NextResponse.json({ error: "tx_not_found" }, { status: 404 });
  }

  // If stellar.expert explicitly marks the transaction as failed, reject it
  if (tx.successful === false) {
    return NextResponse.json({ error: "tx_failed" }, { status: 400 });
  }

  // --- Record it (deduplication handled inside recordMerge) ---
  const isNew = await recordMerge(network as Network, txHash);

  return NextResponse.json({ ok: true, new: isNew });
}
