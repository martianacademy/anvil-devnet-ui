"use client";

import { useEffect, useState } from "react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { HeroSection, StatsBar, LatestBlocks, LatestTransactions } from "@/components/Dashboard";

interface BlockRow {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  gasUsed: string;
}

export default function DashboardPage() {
  const {
    nodeStatus, latestBlock, chainId, port, transactions,
    setNodeStatus, setLatestBlock, setChainId, setPort, setNodeConfig,
  } = useDevnetStore();

  const [gasPrice, setGasPrice] = useState<string>("—");
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [lanIp, setLanIp] = useState<string | null>(null);

  const localRpcUrl = `http://127.0.0.1:${port}`;
  const lanRpcUrl = lanIp ? `http://${lanIp}:${port}` : null;

  // Fetch LAN IP on mount
  useEffect(() => {
    fetch("/api/anvil/status")
      .then((r) => r.json())
      .then((data) => { if (data.lanIp) setLanIp(data.lanIp); })
      .catch(() => {});
  }, []);

  // Poll node status + gas price
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetch("/api/anvil/status").then((r) => r.json());
        if (s.running) {
          setNodeStatus("running");
          setLatestBlock(s.blockNumber ?? 0);
          if (s.chainId) setChainId(s.chainId);
          if (s.port) setPort(s.port);
          if (s.config) setNodeConfig(s.config);
        } else {
          if (useDevnetStore.getState().nodeStatus !== "starting") {
            setNodeStatus("stopped");
          }
        }
        const gp = await fetch("/api/rpc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
        }).then((r) => r.json());
        if (gp.result) {
          const gwei = Number(BigInt(gp.result)) / 1e9;
          setGasPrice(`${gwei.toFixed(2)} Gwei`);
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, []);

  // Clear blocks on chain switch
  useEffect(() => { setBlocks([]); }, [chainId]);

  // Fetch recent blocks
  useEffect(() => {
    if (nodeStatus !== "running") return;
    fetch("/api/explorer?module=block&action=getblocklist&page=1&offset=6")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.result) && setBlocks(d.result))
      .catch(() => {});
  }, [latestBlock, nodeStatus, chainId]);

  return (
    <div className="min-h-screen bg-background">
      <HeroSection
        chainId={chainId}
        port={port}
        localRpcUrl={localRpcUrl}
        lanRpcUrl={lanRpcUrl}
        nodeStatus={nodeStatus}
      />
      <StatsBar
        latestBlock={latestBlock}
        txCount={transactions.length}
        gasPrice={gasPrice}
        nodeStatus={nodeStatus}
      />
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <LatestBlocks blocks={blocks} nodeStatus={nodeStatus} />
        <LatestTransactions transactions={transactions} nodeStatus={nodeStatus} />
      </div>
    </div>
  );
}
