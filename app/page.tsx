"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDevnetStore } from "@/store/useDevnetStore";
import { AnvilControls } from "@/components/AnvilControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Blocks,
  ArrowRightLeft,
  Fuel,
  Activity,
  Clock,
  ChevronRight,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { formatEther } from "viem";

function truncate(s: string, n = 16) {
  if (!s) return "—";
  if (s.length <= n) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff} secs ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  return `${Math.floor(diff / 3600)} hrs ago`;
}

interface BlockRow {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  gasUsed: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { nodeStatus, latestBlock, chainId, port, transactions, setNodeStatus, setLatestBlock } =
    useDevnetStore();

  const [query, setQuery] = useState("");
  const [gasPrice, setGasPrice] = useState<string>("—");
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [showControls, setShowControls] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  // close controls panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) {
        setShowControls(false);
      }
    }
    if (showControls) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showControls]);

  // poll status every 2 s
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetch("/api/anvil/status").then((r) => r.json());
        if (s.running) {
          setNodeStatus("running");
          setLatestBlock(s.blockNumber ?? 0);
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
      } catch { }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // load blocks
  useEffect(() => {
    if (nodeStatus !== "running") return;
    fetch("/api/explorer?module=block&action=getblocklist&page=1&offset=6")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.result) && setBlocks(d.result))
      .catch(() => { });
  }, [latestBlock, nodeStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (q.startsWith("0x") && q.length === 66) return router.push(`/tx/${q}`);
    if (q.startsWith("0x") && q.length === 42) return router.push(`/accounts?address=${q}`);
    if (/^\d+$/.test(q)) return router.push(`/blocks?number=${q}`);
    router.push(`/contracts?search=${q}`);
  };

  const recentTxs = transactions.slice(0, 6);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Hero ── */}
      <div
        className="relative bg-gradient-to-br from-gray-900 via-gray-950 to-black border-b border-gray-800"
        style={{ backgroundImage: "radial-gradient(ellipse at 60% 40%, rgba(59,130,246,0.06) 0%, transparent 70%)" }}
      >
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-white text-2xl font-bold tracking-tight">
                Anvil DevNet Explorer
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Chain ID{" "}
                <span className="text-blue-400 font-mono font-semibold">{chainId}</span>
                {" · "}Port{" "}
                <span className="text-blue-400 font-mono font-semibold">{port}</span>
              </p>
            </div>

            {/* Node status + controls toggle */}
            <div className="relative" ref={controlsRef}>
              <button
                onClick={() => setShowControls((v) => !v)}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-2 text-sm transition-colors"
              >
                <span
                  className={`w-2 h-2 rounded-full ${nodeStatus === "running"
                    ? "bg-green-400 animate-pulse"
                    : nodeStatus === "starting"
                      ? "bg-yellow-400 animate-pulse"
                      : nodeStatus === "error"
                        ? "bg-red-400"
                        : "bg-gray-500"
                    }`}
                />
                <span className="text-gray-200 font-mono text-xs capitalize">{nodeStatus}</span>
                <Settings2 className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {showControls && (
                <div className="absolute right-0 top-10 z-50 w-80 shadow-2xl">
                  <AnvilControls />
                </div>
              )}
            </div>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="mt-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 h-11 text-sm focus-visible:ring-blue-500"
                placeholder="Search by Address / Tx Hash / Block Number"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 px-5 bg-blue-600 hover:bg-blue-500 text-white">
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="border-b border-gray-800 bg-gray-900/60">
        <div className="max-w-5xl mx-auto px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-800 rounded-lg">
              <Blocks className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-gray-400 text-[11px] uppercase tracking-wider">Latest Block</div>
              <div className="text-white font-mono font-bold text-sm">{latestBlock.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-800 rounded-lg">
              <ArrowRightLeft className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <div className="text-gray-400 text-[11px] uppercase tracking-wider">Transactions</div>
              <div className="text-white font-mono font-bold text-sm">{transactions.length.toLocaleString()}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-800 rounded-lg">
              <Fuel className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <div className="text-gray-400 text-[11px] uppercase tracking-wider">Gas Price</div>
              <div className="text-white font-mono font-bold text-sm">
                {nodeStatus === "running" ? gasPrice : "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-800 rounded-lg">
              <Activity className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <div className="text-gray-400 text-[11px] uppercase tracking-wider">Node Status</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge
                  variant={
                    nodeStatus === "running"
                      ? "default"
                      : nodeStatus === "error"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-[11px] px-1.5 py-0"
                >
                  {nodeStatus.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content: Latest Blocks + Latest Transactions ── */}
      <div className="max-w-5xl mx-auto px-4 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Latest Blocks */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-white font-semibold text-sm">Latest Blocks</span>
            {nodeStatus === "running" && (
              <span className="flex items-center gap-1 text-green-400 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          <div className="divide-y divide-gray-800">
            {blocks.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-600 text-sm">
                {nodeStatus === "running" ? "Waiting for blocks…" : "Start Anvil to see blocks"}
              </div>
            ) : (
              blocks.map((b) => (
                <div key={b.number} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors">
                  <div className="flex-shrink-0 w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center">
                    <Blocks className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/blocks?number=${b.number}`} className="text-blue-400 hover:text-blue-300 font-mono text-sm font-semibold">
                        {b.number}
                      </Link>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
                      <Clock className="w-3 h-3" />
                      {b.timestamp ? timeAgo(Number(b.timestamp)) : "—"}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-gray-300 text-xs font-mono">
                      {b.txCount ?? 0}{" "}
                      <span className="text-gray-500">txns</span>
                    </div>
                    <div className="text-gray-500 text-[11px] font-mono mt-0.5">
                      gas {b.gasUsed ? Number(b.gasUsed).toLocaleString() : "—"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-800 px-4 py-2">
            <Link href="/blocks" className="flex items-center justify-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium py-1">
              View all blocks <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Latest Transactions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-white font-semibold text-sm">Latest Transactions</span>
            {nodeStatus === "running" && (
              <span className="flex items-center gap-1 text-green-400 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          <div className="divide-y divide-gray-800">
            {recentTxs.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-600 text-sm">
                {nodeStatus === "running" ? "Waiting for transactions…" : "Start Anvil to see transactions"}
              </div>
            ) : (
              recentTxs.map((tx) => (
                <div key={tx.hash} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors">
                  <div className="flex-shrink-0 w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center">
                    <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/tx/${tx.hash}`} className="text-blue-400 hover:text-blue-300 font-mono text-sm">
                      {truncate(tx.hash, 20)}
                    </Link>
                    <div className="text-gray-500 text-xs mt-0.5 font-mono truncate">
                      <span className="text-gray-400">From</span>{" "}
                      <span className="text-gray-300">{truncate(tx.from_address)}</span>
                      {tx.to_address && (
                        <>
                          {" "}
                          <span className="text-gray-400">To</span>{" "}
                          <span className="text-gray-300">{truncate(tx.to_address)}</span>
                        </>
                      )}
                    </div>
                    {tx.decoded_function && (
                      <div className="text-[11px] text-purple-400 font-mono mt-0.5 truncate">
                        {tx.decoded_function}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-0.5">
                    <div>
                      <Badge
                        variant={tx.status === 1 ? "default" : "destructive"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {tx.status === 1 ? "Success" : "Failed"}
                      </Badge>
                    </div>
                    <div className="text-gray-500 text-[11px] font-mono">
                      {tx.value && BigInt(tx.value) > 0n
                        ? `${parseFloat(formatEther(BigInt(tx.value))).toFixed(4)} ETH`
                        : "0 ETH"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-800 px-4 py-2">
            <Link href="/" className="flex items-center justify-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-medium py-1">
              View all transactions <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
