import { NextRequest, NextResponse } from "next/server";
import { isValidNetwork } from "@/config/networks";
import { isValidGAddress } from "@/lib/utils/validation";
import { getAccountState } from "@/lib/stellar/account";
import { getLiveAccountState } from "@/lib/stellar/account-live";
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
    let accountData = await getAccountState(address, network);

    // stellar.expert lags for freshly created accounts. If the result shows a
    // sub-entry mismatch but SE returned no trustlines or data entries, the
    // account simply isn't indexed yet - fall back to the Horizon-based live
    // path which has zero indexing lag.
    if (
      accountData.subEntryMismatch &&
      accountData.trustlines.length === 0 &&
      accountData.dataEntries.length === 0 &&
      accountData.poolShares.length === 0 &&
      accountData.numSubEntries > 0
    ) {
      try {
        accountData = await getLiveAccountState(address, network);
      } catch {
        // Keep the SE-based result if the live path also fails.
      }
    }

    return NextResponse.json(accountData, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AccountNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("Account fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch account data" }, { status: 500 });
  }
}
