import type { Network } from "@/config/networks";

export interface AccountSigner {
  key: string;
  weight: number;
  type: "ed25519_public_key" | "hash_x" | "preauth_tx" | "ed25519_signed_payload";
}

export interface AccountThresholds {
  low: number;
  med: number;
  high: number;
}

export interface DataEntry {
  key: string;
  value: string; // base64-encoded
}

export interface Trustline {
  asset: string; // "CODE:ISSUER" or "native"
  balance: string; // in lumens/units as string
  // Only provided by the Horizon-compatible reader; rpc getAssetBalance does not
  // expose it. Nothing consumes it (trustline removal always uses ChangeTrust limit 0).
  limit?: string;
  authorized: boolean;
  issuer: string;
  code: string;
}

export interface OpenOffer {
  id: string;
  selling: string; // "CODE:ISSUER" or "native"
  buying: string;
  amount: string;
  price: string;
}

export interface PoolShareEntry {
  poolId: string; // 64-char hex (without the L prefix)
}

export interface AccountState {
  address: string;
  network: Network;
  // From Stellar RPC
  sequence: string;
  nativeBalanceLumens: string;
  dataEntries: DataEntry[];
  signers: AccountSigner[];
  thresholds: AccountThresholds;
  numSubEntries: number;
  numSponsoring: number;
  sponsoredBy: string | null;
  // From SE API / Horizon adapter
  trustlines: Trustline[];
  openOffers: OpenOffer[];
  poolShares: PoolShareEntry[];
  // True when the enumerated subentry count is lower than numSubEntries from the ledger -
  // indicates entries we could not enumerate (e.g. offers when adapter URL not configured).
  subEntryMismatch: boolean;
}

export interface MediatorCheckResult {
  requiresMediator: boolean;
  reason: string;
  requiresMemo: boolean;
  memoType: "text" | "id" | "hash" | null;
  exchangeName: string | null;
}
