import { StrKey } from "@stellar/stellar-sdk";

export function isValidGAddress(address: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

export function isValidSecretKey(secret: string): boolean {
  try {
    return StrKey.isValidEd25519SecretSeed(secret);
  } catch {
    return false;
  }
}

export function isValidMemo(memo: string, type: "text" | "id" | "hash"): boolean {
  if (type === "text") return memo.length > 0 && memo.length <= 28;
  if (type === "id") return /^\d+$/.test(memo) && BigInt(memo) <= BigInt("18446744073709551615");
  return memo.length > 0;
}
