import { seGet } from "./client";
import type { Network } from "@/config/networks";
import type { ConversionPath } from "@/types/plan";
import { SLIPPAGE_BPS } from "@/config/constants";

interface SePathsResponse {
  _embedded?: {
    records?: Array<{
      destination_asset_type: string;
      destination_asset_code?: string;
      destination_asset_issuer?: string;
      source_asset_type: string;
      source_asset_code?: string;
      source_asset_issuer?: string;
      source_amount: string;
      destination_amount: string;
      path?: Array<{
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
      }>;
    }>;
  };
}

function assetToStr(type: string, code?: string, issuer?: string): string {
  if (type === "native") return "native";
  return `${code}:${issuer}`;
}

export async function fetchConversionPath(
  fromAsset: string,
  amount: string,
  network: Network,
  toAsset = "native"
): Promise<ConversionPath | null> {
  const params: Record<string, string> = {
    source_amount: amount,
    destination_asset_type: toAsset === "native" ? "native" : "credit_alphanum4",
  };

  if (fromAsset === "native") {
    params.source_asset_type = "native";
  } else {
    const [code, issuer] = fromAsset.split(":");
    params.source_asset_type = code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
    params.source_asset_code = code;
    params.source_asset_issuer = issuer;
  }

  if (toAsset !== "native") {
    const [code, issuer] = toAsset.split(":");
    params.destination_asset_code = code;
    params.destination_asset_issuer = issuer;
  }

  try {
    const data = await seGet<SePathsResponse>(network, "/paths/strict-send", params);
    const records = data._embedded?.records ?? [];
    if (records.length === 0) return null;

    const best = records[0];
    const destAmount = parseFloat(best.destination_amount);
    const destMin = (destAmount * (1 - SLIPPAGE_BPS / 10000)).toFixed(7);

    const path =
      best.path?.map((p) => assetToStr(p.asset_type, p.asset_code, p.asset_issuer)) ?? [];

    return {
      fromAsset,
      toAsset,
      path,
      estimatedReceive: best.destination_amount,
      destMin,
    };
  } catch {
    return null;
  }
}
