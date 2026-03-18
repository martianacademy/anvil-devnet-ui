"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDevnetStore } from "@/store/useDevnetStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Zap, Copy, Check } from "lucide-react";

interface HeroSectionProps {
  chainId: number;
  port: number;
  localRpcUrl: string;
  lanRpcUrl: string | null;
  nodeStatus: string;
}

export function HeroSection({ chainId, port, localRpcUrl, lanRpcUrl, nodeStatus }: HeroSectionProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<"local" | "lan" | false>(false);

  const copyUrl = (url: string, type: "local" | "lan") => {
    navigator.clipboard.writeText(url);
    setCopied(type);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (q.startsWith("0x") && q.length === 66) return router.push(`/tx/${q}`);
    if (q.startsWith("0x") && q.length === 42) return router.push(`/accounts?address=${q}`);
    if (/^\d+$/.test(q)) return router.push(`/blocks/${q}`);
    router.push(`/contracts?search=${q}`);
  };

  return (
    <div className="relative border-b border-border/50 overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(var(--color-border,#333) 1px, transparent 1px),
            linear-gradient(90deg, var(--color-border,#333) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
      {/* Primary glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full bg-primary/8 blur-[100px] pointer-events-none" />
      {/* Secondary accent glow */}
      <div className="absolute -bottom-20 right-1/4 w-[400px] h-[200px] rounded-full bg-chart-2/5 blur-[80px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 py-10 animate-slide-up">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              Anvil DevNet Explorer
            </h1>
          </div>
          <div className="flex items-center gap-2 ml-12 flex-wrap">
            <ChipBadge label="Chain" value={String(chainId)} />
            <ChipBadge label="Port" value={String(port)} />
            {nodeStatus === "running" && (
              <>
                <button
                  onClick={() => copyUrl(localRpcUrl, "local")}
                  className="inline-flex items-center gap-1.5 bg-accent/60 border border-border/80 text-xs font-mono px-2.5 py-1 rounded-full text-primary hover:bg-accent hover:border-primary/30 transition-all cursor-pointer"
                >
                  <span className="text-muted-foreground">RPC</span>
                  {localRpcUrl}
                  {copied === "local"
                    ? <Check className="w-3 h-3 text-green-400" />
                    : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
                {lanRpcUrl && (
                  <button
                    onClick={() => copyUrl(lanRpcUrl, "lan")}
                    className="inline-flex items-center gap-1.5 bg-accent/60 border border-border/80 text-xs font-mono px-2.5 py-1 rounded-full text-primary hover:bg-accent hover:border-primary/30 transition-all cursor-pointer"
                  >
                    <span className="text-muted-foreground">LAN</span>
                    {lanRpcUrl}
                    {copied === "lan"
                      ? <Check className="w-3 h-3 text-green-400" />
                      : <Copy className="w-3 h-3 text-muted-foreground" />}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-10 bg-card/80 border-border/80 text-foreground placeholder:text-muted-foreground/50 h-11 text-sm rounded-xl focus-visible:ring-primary/40 focus-visible:border-primary/40 backdrop-blur-sm"
              placeholder="Search by Address / Tx Hash / Block Number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-11 px-6 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
            Search
          </Button>
        </form>
      </div>
    </div>
  );
}

function ChipBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-accent/60 border border-border/80 text-xs font-mono px-2.5 py-1 rounded-full text-primary">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </span>
  );
}
