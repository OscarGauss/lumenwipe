import { NextResponse } from "next/server";
import { getStats } from "@/lib/kv";

// Revalidate every 60 seconds so the page counter stays reasonably fresh
// without hammering KV on every request.
export const revalidate = 60;

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats);
}
