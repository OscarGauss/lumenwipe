import { NextRequest, NextResponse } from "next/server";
import { Account } from "@stellar/stellar-sdk";
import { isValidNetwork } from "@/config/networks";
import { isValidGAddress } from "@/lib/utils/validation";
import { getAccountState } from "@/lib/stellar/account";
import { buildFundMediatorTx } from "@/lib/stellar/tx-builder/merge";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ network: string }> }
) {
  const { network } = await params;
  if (!isValidNetwork(network)) {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }

  let body: { sourceAddress?: string; mediatorAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceAddress, mediatorAddress } = body;

  if (!sourceAddress || !isValidGAddress(sourceAddress)) {
    return NextResponse.json({ error: "Invalid sourceAddress" }, { status: 400 });
  }
  if (!mediatorAddress || !isValidGAddress(mediatorAddress)) {
    return NextResponse.json({ error: "Invalid mediatorAddress" }, { status: 400 });
  }

  try {
    const accountData = await getAccountState(sourceAddress, network);
    const sdkAccount = new Account(sourceAddress, accountData.sequence);
    const txXdr = buildFundMediatorTx(sdkAccount, mediatorAddress, network);

    return NextResponse.json({ txXdr, mediatorAddress });
  } catch (err) {
    console.error("Mediator prepare error:", err);
    return NextResponse.json({ error: "Failed to build mediator transaction" }, { status: 500 });
  }
}
