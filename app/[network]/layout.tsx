"use client";

import { use, useEffect } from "react";
import { notFound } from "next/navigation";
import { isValidNetwork } from "@/config/networks";
import { useNetworkStore } from "@/store/network";
import { useDemolishStore } from "@/store/demolish";
import NavBar from "@/components/layout/NavBar";

export default function NetworkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ network: string }>;
}) {
  const { network } = use(params);
  const setNetwork = useNetworkStore((s) => s.setNetwork);
  const currentNetwork = useNetworkStore((s) => s.network);
  const reset = useDemolishStore((s) => s.reset);

  if (!isValidNetwork(network)) notFound();

  useEffect(() => {
    if (currentNetwork !== network) {
      reset(); // Clear state when switching networks
    }
    setNetwork(network as "public" | "testnet");
  }, [network, currentNetwork, setNetwork, reset]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavBar network={network as "public" | "testnet"} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
