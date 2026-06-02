import type { Network } from "@/config/networks";

export interface AccountSigner {
  key: string;
  weight: number;
  type: "ed25519_public_key" | "hash_x" | "preauth_tx";
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
  limit: string;
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
  sponsoredBy: string | null;
  // From SE API
  trustlines: Trustline[];
  openOffers: OpenOffer[];
}

export interface MediatorCheckResult {
  requiresMediator: boolean;
  reason: string;
  requiresMemo: boolean;
  memoType: "text" | "id" | "hash" | null;
  exchangeName: string | null;
}
