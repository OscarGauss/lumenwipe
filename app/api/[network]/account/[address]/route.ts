import { NextRequest, NextResponse } from "next/server";
import { isValidNetwork } from "@/config/networks";
import { isValidGAddress } from "@/lib/utils/validation";
import { getAccountState } from "@/lib/stellar/account";
import { AccountNotFoundError } from "@/lib/utils/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ network: string; address: string }> }
) {
  const { network, address } = await params;

  if (!isValidNetwork(network)) {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }
  if (!isValidGAddress(address)) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400 });
  }

  try {
    // getAccountState fetches offers internally via SE API (with error handling)
    const accountData = await getAccountState(address, network);

    return NextResponse.json(accountData, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("Account fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch account data" }, { status: 500 });
  }
}
