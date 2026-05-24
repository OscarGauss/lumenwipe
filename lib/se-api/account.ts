import { seGet } from "./client";
import type { Network } from "@/config/networks";
import type { Trustline } from "@/types/account";

interface SeBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
  is_authorized?: boolean;
}

interface SeAccountResponse {
  id: string;
  balances?: SeBalance[];
  subentry_count?: number;
}

export async function fetchAccountTrustlines(
  address: string,
  network: Network
): Promise<Trustline[]> {
  const data = await seGet<SeAccountResponse>(network, `/account/${address}`);

  if (!data.balances) return [];

  return data.balances
    .filter((b) => b.asset_type !== "native")
    .map((b) => ({
      asset: `${b.asset_code}:${b.asset_issuer}`,
      balance: b.balance,
      limit: b.limit ?? "0",
      authorized: b.is_authorized ?? true,
      issuer: b.asset_issuer ?? "",
      code: b.asset_code ?? "",
    }));
}
