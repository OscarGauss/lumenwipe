import { kv } from "@vercel/kv";
import type { Network } from "@/config/networks";

// Redis key layout
// stats:{network}:count       → integer counter
// stats:{network}:processed   → set of already-counted txHashes (deduplication)

const COUNT_KEY: Record<Network, string> = {
  testnet: "stats:testnet:count",
  public:  "stats:mainnet:count",
};

const PROCESSED_KEY = (network: Network) => `stats:${network}:processed`;

export interface StatsResult {
  testnet: number;
  mainnet: number;
}

export async function getStats(): Promise<StatsResult> {
  try {
    const [testnet, mainnet] = await Promise.all([
      kv.get<number>(COUNT_KEY.testnet),
      kv.get<number>(COUNT_KEY.public),
    ]);
    return { testnet: testnet ?? 0, mainnet: mainnet ?? 0 };
  } catch {
    // KV not configured (local dev) or unavailable — return zeros silently
    return { testnet: 0, mainnet: 0 };
  }
}

/**
 * Increments the merge counter for the given network.
 * Returns true if the record was new, false if it was a duplicate.
 * Never throws — stats are non-critical.
 */
export async function recordMerge(network: Network, txHash: string): Promise<boolean> {
  try {
    const processedKey = PROCESSED_KEY(network);
    const countKey = COUNT_KEY[network];

    const alreadyProcessed = await kv.sismember(processedKey, txHash);
    if (alreadyProcessed) return false;

    // Mark as processed and increment counter in a single pipeline
    const pipeline = kv.pipeline();
    pipeline.sadd(processedKey, txHash);
    pipeline.incr(countKey);
    await pipeline.exec();

    return true;
  } catch {
    return false;
  }
}
