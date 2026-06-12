import { fetchOffersFromAdapter } from "@/lib/stellar/horizon-adapter";
import type { Network } from "@/config/networks";
import type { OpenOffer } from "@/types/account";

// The stellar.expert offers endpoint (GET /account/{address}/offers) returns HTTP 404
// for all addresses. Offers are enumerated via the Horizon-compatible adapter instead.
export async function fetchOpenOffers(address: string, network: Network): Promise<OpenOffer[]> {
  return fetchOffersFromAdapter(address, network);
}
