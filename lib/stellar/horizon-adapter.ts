import { PATH_ROUTING_API_URLS } from "@/config/networks";
import type { Network } from "@/config/networks";
import type { OpenOffer } from "@/types/account";

interface HorizonOffer {
  id: string | number;
  selling: { asset_type: string; asset_code?: string; asset_issuer?: string };
  buying: { asset_type: string; asset_code?: string; asset_issuer?: string };
  amount: string;
  price: string;
}

interface HorizonOffersPage {
  _embedded?: { records?: HorizonOffer[] };
  _links?: { next?: { href?: string } };
}

function offerAssetStr(a: {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
}): string {
  if (a.asset_type === "native") return "native";
  return `${a.asset_code}:${a.asset_issuer}`;
}

const PAGE_LIMIT = 200;
const MAX_TOTAL = 1000;

/**
 * Fetches open DEX offers for an account from a Horizon-compatible API.
 * Uses PATH_ROUTING_API_URLS[network] as the base. Returns [] if the URL
 * is not configured rather than throwing - callers must treat missing offers
 * as an unverified state and surface an appropriate warning.
 */
export async function fetchOffersFromAdapter(
  address: string,
  network: Network
): Promise<OpenOffer[]> {
  const base = PATH_ROUTING_API_URLS[network];
  if (!base) return [];

  const allOffers: OpenOffer[] = [];
  let nextUrl: string | null = `${base}/accounts/${address}/offers?limit=${PAGE_LIMIT}`;

  while (nextUrl && allOffers.length < MAX_TOTAL) {
    let res: Response;
    try {
      res = await fetch(nextUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      break;
    }
    if (!res.ok) break;

    const page = (await res.json()) as HorizonOffersPage;
    const records = page._embedded?.records ?? [];

    for (const o of records) {
      allOffers.push({
        id: String(o.id),
        selling: offerAssetStr(o.selling),
        buying: offerAssetStr(o.buying),
        amount: o.amount,
        price: o.price,
      });
    }

    const nextHref = page._links?.next?.href;
    nextUrl = nextHref && records.length === PAGE_LIMIT ? nextHref : null;
  }

  return allOffers;
}
