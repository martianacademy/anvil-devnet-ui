"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDevnetStore } from "@/store/useDevnetStore";
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
  Zap,
  TrendingUp,
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
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface BlockRow {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  gasUsed: string;
}

const statusDot: Record<string, string> = {
  running: "bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)] animate-pulse",
  starting: "bg-yellow-400 shadow-[0_0_8px_2px_rgba(250,204,21,0.6)] animate-pulse",
  error: "bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)]",
  stopped: "bg-muted-foreground/40",
};

export default function DashboardPage() {
  const router = useRouter();
  const {
    nodeStatus, latestBlock, chainId, port, transactions,
    setNodeStatus, setLatestBlock, setChainId, setPort, setNodeConfig,
  } = useDevnetStore();

  const [query, setQuery] = useState("");
  const [gasPrice, setGasPrice] = useState<string>("—");
  const [blocks, setBlocks] = useState<BlockRow[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetch("/api/anvil/status").then((r) => r.json());
        if (s.running) {
          // Sync ALL running-Anvil state back into the store so a page
          // refresh correctly reflects chain 204 (or whatever is running)
          // rather than always showing the default 31337.
          setNodeStatus("running");
          setLatestBlock(s.blockNumber ?? 0);
          if (s.chainId) setChainId(s.chainId);
          if (s.port) setPort(s.port);
          if (s.config) setNodeConfig(s.config);
        } else {
          // Don't override a "starting" status — Anvil may still be booting
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
      } catch { }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { setBlocks([]); }, [chainId]);

  useEffect(() => {
    if (nodeStatus !== "running") return;
    fetch("/api/explorer?module=block&action=getblocklist&page=1&offset=6")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.result) && setBlocks(d.result))
      .catch(() => { });
  }, [latestBlock, nodeStatus, chainId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (q.startsWith("0x") && q.length === 66) return router.push(`/tx/${q}`);
    if (q.startsWith("0x") && q.length === 42) return router.push(`/accounts?address=${q}`);
    if (/^\d+$/.test(q)) return router.push(`/blocks/${q}`);
    router.push(`/contracts?search=${q}`);
  };

  const recentTxs = transactions.slice(0, 6);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero ── */}
      <div className="relative border-b border-border overflow-hidden">
        {/* Background grid + glow */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(var(--color-border,#333) 1px, transparent 1px),
              linear-gradient(90deg, var(--color-border,#333) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/10 blur-[80px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 py-8">
          <div className="mb-5">
            {/* Title block */}
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/20">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <h1 className="text-foreground text-2xl font-bold tracking-tight">
                  Anvil DevNet Explorer
                </h1>
              </div>
              <div className="flex items-center gap-2 ml-10 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-accent/60 border border-border text-xs font-mono px-2 py-0.5 rounded-full text-primary">
                  <span className="text-muted-foreground">Chain</span>
                  {chainId}
                </span>
                <span className="inline-flex items-center gap-1.5 bg-accent/60 border border-border text-xs font-mono px-2 py-0.5 rounded-full text-primary">
                  <span className="text-muted-foreground">Port</span>
                  {port}
                </span>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="mt-6 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground/60 h-11 text-sm rounded-xl focus-visible:ring-primary/50 focus-visible:border-primary/50"
                placeholder="Search by Address / Tx Hash / Block Number"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-0 grid grid-cols-2 sm:grid-cols-4">
          {([
            {
              icon: <Blocks className="w-4 h-4 text-primary" />,
              label: "Latest Block",
              value: latestBlock.toLocaleString(),
              color: "bg-primary/10",
              border: "border-r border-border",
            },
            {
              icon: <ArrowRightLeft className="w-4 h-4 text-violet-400" />,
              label: "Transactions",
              value: transactions.length.toLocaleString(),
              color: "bg-violet-400/10",
              border: "sm:border-r border-border",
            },
            {
              icon: <Fuel className="w-4 h-4 text-amber-400" />,
              label: "Gas Price",
              value: nodeStatus === "running" ? gasPrice : "—",
              color: "bg-amber-400/10",
              border: "border-r border-t border-border sm:border-t-0",
            },
            {
              icon: <Activity className="w-4 h-4 text-emerald-400" />,
              label: "Node Status",
              value: null,
              color: "bg-emerald-400/10",
              border: "border-t border-border sm:border-t-0",
            },
          ] as const).map((stat, i) => (
            <div key={i} className={`flex items-center gap-2.5 sm:gap-3 px-3 sm:px-6 py-4 ${stat.border}`}>
              <div className={`p-1.5 sm:p-2 rounded-lg ${stat.color} flex-shrink-0`}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <div className="text-muted-foreground text-[9px] sm:text-[10px] uppercase tracking-widest font-medium">{stat.label}</div>
                {stat.value !== null ? (
                  <div className="text-foreground font-mono font-bold text-sm mt-0.5 truncate">{stat.value}</div>
                ) : (
                  <div className="mt-1">
                    <Badge
                      variant={nodeStatus === "running" ? "default" : nodeStatus === "error" ? "destructive" : "secondary"}
                      className="text-[10px] px-2 py-0 rounded-full font-mono tracking-wider"
                    >
                      {nodeStatus.toUpperCase()}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── Latest Blocks ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Blocks className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-foreground font-semibold text-sm">Latest Blocks</span>
            </div>
            {nodeStatus === "running" && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono">
                <TrendingUp className="w-3 h-3" />
                LIVE
              </span>
            )}
          </div>

          <div className="divide-y divide-border">
            {blocks.length === 0 ? (
              <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
                <Blocks className="w-8 h-8 text-border" />
                <p className="text-muted-foreground text-sm">
                  {nodeStatus === "running" ? "Waiting for blocks…" : "Start Anvil to see blocks"}
                </p>
              </div>
            ) : (
              blocks.map((b) => (
                <div key={b.number} className="group flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors">
                  <div className="flex-shrink-0 w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Blocks className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/blocks/${b.number}`}
                      className="text-primary hover:underline font-mono text-sm font-bold"
                    >
                      #{b.number}
                    </Link>
                    <div className="flex items-center gap-1 text-muted-foreground text-[11px] mt-0.5">
                      <Clock className="w-3 h-3" />
                      {b.timestamp ? timeAgo(Number(b.timestamp)) : "—"}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono">
                      <span className="text-foreground font-medium">{b.txCount ?? 0}</span>
                      <span className="text-muted-foreground"> txns</span>
                    </div>
                    <div className="text-muted-foreground text-[10px] font-mono mt-0.5">
                      {b.gasUsed ? `${Number(b.gasUsed).toLocaleString()} gas` : "—"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border bg-accent/20">
            <Link
              href="/blocks"
              className="flex items-center justify-center gap-1.5 text-primary hover:text-primary/80 text-xs font-semibold py-3 transition-colors"
            >
              View all blocks <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── Latest Transactions ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-400/10">
                <ArrowRightLeft className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span className="text-foreground font-semibold text-sm">Latest Transactions</span>
            </div>
            {nodeStatus === "running" && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono">
                <TrendingUp className="w-3 h-3" />
                LIVE
              </span>
            )}
          </div>

          <div className="divide-y divide-border">
            {recentTxs.length === 0 ? (
              <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
                <ArrowRightLeft className="w-8 h-8 text-border" />
                <p className="text-muted-foreground text-sm">
                  {nodeStatus === "running" ? "Waiting for transactions…" : "Start Anvil to see transactions"}
                </p>
              </div>
            ) : (
              recentTxs.map((tx) => (
                <div key={tx.hash} className="group flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors">
                  <div className="flex-shrink-0 w-9 h-9 bg-violet-400/10 rounded-xl flex items-center justify-center">
                    <ArrowRightLeft className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline font-mono text-sm font-bold">
                      {truncate(tx.hash, 20)}
                    </Link>
                    <div className="text-muted-foreground text-[11px] mt-0.5 font-mono truncate">
                      <span>From </span>
                      <span className="text-foreground/70">{truncate(tx.from_address)}</span>
                      {tx.to_address && (
                        <><span> → </span><span className="text-foreground/70">{truncate(tx.to_address)}</span></>
                      )}
                    </div>
                    {tx.decoded_function && (
                      <div className="text-[10px] text-violet-400 font-mono mt-0.5 truncate bg-violet-400/5 px-1.5 py-0.5 rounded-md w-fit">
                        {tx.decoded_function}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <Badge
                      variant={tx.status === 1 ? "default" : "destructive"}
                      className="text-[10px] px-2 py-0 rounded-full font-mono"
                    >
                      {tx.status === 1 ? "✓" : "✗"}
                    </Badge>
                    <div className="text-muted-foreground text-[10px] font-mono">
                      {tx.value && BigInt(tx.value) > 0n
                        ? `${parseFloat(formatEther(BigInt(tx.value))).toFixed(4)} ETH`
                        : "0 ETH"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border bg-accent/20">
            <Link
              href="/transactions"
              className="flex items-center justify-center gap-1.5 text-primary hover:text-primary/80 text-xs font-semibold py-3 transition-colors"
            >
              View all transactions <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

