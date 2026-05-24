import { seGet, SeApiError } from "./client";
import type { Network } from "@/config/networks";
import type { OpenOffer } from "@/types/account";

interface SeOffer {
  id: string;
  selling: { asset_type: string; asset_code?: string; asset_issuer?: string };
  buying: { asset_type: string; asset_code?: string; asset_issuer?: string };
  amount: string;
  price: string;
}

interface SeOffersResponse {
  _embedded?: { records?: SeOffer[] };
  records?: SeOffer[];
}

function assetStr(a: SeOffer["selling"]): string {
  if (a.asset_type === "native") return "native";
  return `${a.asset_code}:${a.asset_issuer}`;
}

export async function fetchOpenOffers(
  address: string,
  network: Network
): Promise<OpenOffer[]> {
  let data: SeOffersResponse;
  try {
    data = await seGet<SeOffersResponse>(network, `/account/${address}/offers`, {
      limit: "200",
    });
  } catch (err) {
    if (err instanceof SeApiError && err.status === 404) return [];
    throw err;
  }

  const records = data._embedded?.records ?? data.records ?? [];

  return records.map((o) => ({
    id: String(o.id),
    selling: assetStr(o.selling),
    buying: assetStr(o.buying),
    amount: o.amount,
    price: o.price,
  }));
}
