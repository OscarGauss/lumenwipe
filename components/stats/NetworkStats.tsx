"use client";

import { useEffect, useState } from "react";

interface Stats {
  testnet: number;
  mainnet: number;
}

const NETWORKS: { key: keyof Stats; label: string; sublabel: string }[] = [
  { key: "testnet", label: "Testnet", sublabel: "accounts closed" },
  { key: "mainnet", label: "Mainnet", sublabel: "accounts closed" },
];

export default function NetworkStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      // non-critical — silently ignore
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3 mb-10">
      {NETWORKS.map(({ key, label, sublabel }) => {
        const count = stats?.[key];
        return (
          <div
            key={key}
            className="bg-card border border-border rounded-lg p-4 text-center"
          >
            <p className="text-xs text-muted-foreground mb-2">{label}</p>
            <p className="text-3xl font-bold text-stellar tabular-nums">
              {count === undefined ? (
                <span className="inline-block w-8 h-7 bg-border rounded animate-pulse" />
              ) : (
                count.toLocaleString()
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
          </div>
        );
      })}
    </div>
  );
}
