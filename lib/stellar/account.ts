import { Keypair, xdr, StrKey, Asset } from "@stellar/stellar-sdk";
import { getRpcServer } from "./rpc";
import { seGet } from "@/lib/se-api/client";
import { AccountNotFoundError } from "@/lib/utils/errors";
import { STROOPS_PER_XLM } from "@/config/constants";
import type { Network } from "@/config/networks";
import type {
  AccountState,
  AccountSigner,
  AccountThresholds,
  DataEntry,
  Trustline,
  OpenOffer,
} from "@/types/account";

// ─── SE API types ─────────────────────────────────────────────────────────────

interface SeAccountSummary {
  account?: string;
  assets?: string[];
  data?: Record<string, string>;
}

interface SeOffersPage {
  _embedded?: {
    records?: Array<{
      id: string | number;
      selling: { asset_type: string; asset_code?: string; asset_issuer?: string };
      buying: { asset_type: string; asset_code?: string; asset_issuer?: string };
      amount: string;
      price: string;
    }>;
  };
}

function seAssetStr(a: { asset_type: string; asset_code?: string; asset_issuer?: string }): string {
  if (a.asset_type === "native") return "native";
  return `${a.asset_code}:${a.asset_issuer}`;
}

// Parse SE API asset string like "USDCAllow-GISSUER56CHARS-2" or "XLM"
function parseSeAsset(raw: string): { code: string; issuer: string } | null {
  if (raw === "XLM") return null;
  const match = raw.match(/^(.+)-([GC][A-Z0-9]{55})-\d+$/);
  if (!match) return null;
  return { code: match[1], issuer: match[2] };
}

// Build the correct TrustLineAsset xdr for a given asset
function buildTrustLineAsset(asset: Asset): xdr.TrustLineAsset {
  if (asset.isNative()) {
    return xdr.TrustLineAsset.assetTypeNative();
  }
  const code = asset.getCode();
  if (code.length <= 4) {
    return xdr.TrustLineAsset.assetTypeCreditAlphanum4(asset.toXDRObject().alphaNum4());
  }
  return xdr.TrustLineAsset.assetTypeCreditAlphanum12(asset.toXDRObject().alphaNum12());
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function getAccountState(
  address: string,
  network: Network
): Promise<AccountState> {
  const server = getRpcServer(network);

  // 1. Get sequence number + validate existence via Stellar RPC
  let sequence: string;
  try {
    const rpcAccount = await server.getAccount(address);
    sequence = rpcAccount.sequenceNumber();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
      throw new AccountNotFoundError(address);
    }
    throw err;
  }

  // 2. Get full account structure from AccountEntry XDR via getLedgerEntries
  let signers: AccountSigner[] = [{ key: address, weight: 1, type: "ed25519_public_key" }];
  let thresholds: AccountThresholds = { low: 0, med: 1, high: 1 };
  let numSubEntries = 0;
  let nativeBalanceLumens = "0";

  try {
    const accountKey = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({
        accountId: Keypair.fromPublicKey(address).xdrPublicKey(),
      })
    );
    const ledgerResp = await server.getLedgerEntries(accountKey);

    if (ledgerResp.entries && ledgerResp.entries.length > 0) {
      const entryVal = ledgerResp.entries[0].val as unknown as {
        account(): {
          seqNum(): { toString(): string };
          balance(): { toString(): string };
          thresholds(): Buffer;
          signers(): Array<{ key(): { ed25519(): Buffer }; weight(): number }>;
          numSubEntries(): number;
        };
      };
      const accountEntry = entryVal.account();

      const rawBalance = BigInt(accountEntry.balance().toString());
      nativeBalanceLumens = (Number(rawBalance) / STROOPS_PER_XLM).toFixed(7);

      const t = accountEntry.thresholds() as Buffer;
      thresholds = { low: t[1], med: t[2], high: t[3] };
      const masterWeight = t[0];

      const rawSigners = accountEntry.signers();
      signers = [
        { key: address, weight: masterWeight, type: "ed25519_public_key" },
        ...rawSigners.map((s) => ({
          key: StrKey.encodeEd25519PublicKey(s.key().ed25519()),
          weight: s.weight(),
          type: "ed25519_public_key" as const,
        })),
      ];

      numSubEntries = accountEntry.numSubEntries();
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.warn("[account] LedgerEntry XDR parse failed, using defaults:", err);
  }

  // 3. Enumerate assets + data entries from SE API
  let seAssets: string[] = [];
  let dataEntries: DataEntry[] = [];
  let openOffers: OpenOffer[] = [];

  try {
    const seAccount = await seGet<SeAccountSummary>(network, `/account/${address}`);
    seAssets = seAccount.assets ?? [];
    dataEntries = Object.entries(seAccount.data ?? {}).map(([key, value]) => ({
      key,
      value,
    }));
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.warn("[account] SE API account fetch failed:", err);
  }

  try {
    const offersPage = await seGet<SeOffersPage>(
      network,
      `/account/${address}/offers`,
      { limit: "200" }
    );
    openOffers = (offersPage._embedded?.records ?? []).map((o) => ({
      id: String(o.id),
      selling: seAssetStr(o.selling),
      buying: seAssetStr(o.buying),
      amount: o.amount,
      price: o.price,
    }));
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.warn("[account] SE API offers fetch failed:", err);
  }

  // 4. Fetch trustline balances via getLedgerEntries (one call per asset)
  const trustlines: Trustline[] = [];
  const nonNativeAssets = seAssets
    .map(parseSeAsset)
    .filter((a): a is { code: string; issuer: string } => a !== null);

  for (const { code, issuer } of nonNativeAssets) {
    try {
      const asset = new Asset(code, issuer);
      const tlKey = xdr.LedgerKey.trustline(
        new xdr.LedgerKeyTrustLine({
          accountId: Keypair.fromPublicKey(address).xdrPublicKey(),
          asset: buildTrustLineAsset(asset),
        })
      );
      const tlResp = await server.getLedgerEntries(tlKey);

      if (!tlResp.entries || tlResp.entries.length === 0) {
        continue;
      }

      const tlData = tlResp.entries[0].val as unknown as {
        trustLine(): {
          balance(): { toString(): string };
          limit(): { toString(): string };
          flags(): number;
        };
      };
      const tl = tlData.trustLine();

      const balStroops = BigInt(tl.balance().toString());
      const limitStroops = BigInt(tl.limit().toString());
      const balance = (Number(balStroops) / STROOPS_PER_XLM).toFixed(7);
      const limit = (Number(limitStroops) / STROOPS_PER_XLM).toFixed(7);
      const authorized = (tl.flags() & 1) === 1;

      trustlines.push({ asset: `${code}:${issuer}`, balance, limit, authorized, issuer, code });
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.warn(`[account] trustline fetch failed for ${code}:${issuer}:`, err);
    }
  }

  return {
    address,
    network,
    sequence,
    nativeBalanceLumens,
    dataEntries,
    signers,
    thresholds,
    numSubEntries,
    sponsoredBy: null,
    trustlines,
    openOffers,
  };
}
