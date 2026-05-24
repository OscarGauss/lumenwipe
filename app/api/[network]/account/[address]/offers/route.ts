import { NextRequest, NextResponse } from "next/server";
import { isValidNetwork } from "@/config/networks";
import { isValidGAddress } from "@/lib/utils/validation";
import { fetchOpenOffers } from "@/lib/se-api/offers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { network: string; address: string } }
) {
  const { network, address } = params;

  if (!isValidNetwork(network)) {
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  }
  if (!isValidGAddress(address)) {
    return NextResponse.json({ error: "Invalid Stellar address" }, { status: 400 });
  }

  try {
    const offers = await fetchOpenOffers(address, network);
    return NextResponse.json({ offers }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Offers fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch offers" }, { status: 500 });
  }
}
