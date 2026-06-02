"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { Network } from "@/config/networks";

interface NetworkSwitcherProps {
  currentNetwork: Network;
}

export default function NetworkSwitcher({ currentNetwork }: NetworkSwitcherProps) {
  return (
    <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5 text-xs">
      {(["public", "testnet"] as Network[]).map((net) => (
        <Link
          key={net}
          href={`/${net}`}
          className={cn(
            "px-2.5 py-1 rounded font-medium transition-colors",
            currentNetwork === net
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {net === "public" ? "Mainnet" : "Testnet"}
        </Link>
      ))}
    </div>
  );
}
