import { kv } from "@vercel/kv";
import { createHash } from "crypto";
import type { Network } from "@/config/networks";

// ─── Key layout ──────────────────────────────────────────────────────────────
// stats:{network}:count          → integer counter
// stats:{network}:processed      → set of already-counted txHashes
// stats:ratelimit:{ipHash}:{date} → per-IP daily request counter

const COUNT_KEY: Record<Network, string> = {
  testnet: "stats:testnet:count",
  public:  "stats:mainnet:count",
};

const PROCESSED_KEY = (n: Network) => `stats:${n}:processed`;
const RATE_KEY = (ipHash: string) =>
  `stats:ratelimit:${ipHash}:${new Date().toISOString().slice(0, 10)}`;

const RATE_LIMIT_PER_DAY = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashIp(ip: string): string {
  // One-way hash so no raw IP is stored in Redis
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
 * Increments the daily request counter for this IP and returns whether
 * the caller is within the allowed limit.
 * Fails open: if KV is unavailable the request is allowed through.
 */
export async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const key = RATE_KEY(hashIp(ip));
    // Increment and set TTL in one pipeline — both ops always run together
    const pipeline = kv.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, 86_400); // 24 h TTL
    const [count] = (await pipeline.exec()) as [number, number];
    return count <= RATE_LIMIT_PER_DAY;
  } catch {
    return true; // fail open rather than block legitimate users
  }
}

// Lua script: atomically check deduplication and increment the counter.
// Returns 1 when the txHash is new (counter incremented), 0 when duplicate.
// Running as a single script makes the check-then-set fully atomic.
const RECORD_SCRIPT = `
  if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
    return 0
  end
  redis.call('SADD', KEYS[1], ARGV[1])
  redis.call('INCR', KEYS[2])
  return 1
`;

/**
 * Atomically records a merge for the given network.
 * Returns true when the txHash was new, false when it was a duplicate.
 * Never throws — stats are non-critical.
 */
export async function recordMerge(network: Network, txHash: string): Promise<boolean> {
  try {
    const result = await kv.eval(
      RECORD_SCRIPT,
      [PROCESSED_KEY(network), COUNT_KEY[network]],
      [txHash],
    );
    return (result as number) === 1;
  } catch {
    return false;
  }
}
