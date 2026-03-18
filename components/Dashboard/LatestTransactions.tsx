import Link from "next/link";
import { ArrowRightLeft, TrendingUp, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatEther } from "viem";
import type { TxSummary } from "@/store/useDevnetStore";

interface LatestTransactionsProps {
  transactions: TxSummary[];
  nodeStatus: string;
}

function truncate(s: string, n = 16) {
  if (!s) return "—";
  if (s.length <= n) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function TxSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="w-9 h-9 skeleton rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="w-32 h-3.5 skeleton" />
        <div className="w-48 h-2.5 skeleton" />
      </div>
      <div className="space-y-2 text-right">
        <div className="w-8 h-5 skeleton ml-auto rounded-full" />
        <div className="w-16 h-2.5 skeleton ml-auto" />
      </div>
    </div>
  );
}

export function LatestTransactions({ transactions, nodeStatus }: LatestTransactionsProps) {
  const recentTxs = transactions.slice(0, 6);

  return (
    <div className="bg-card/80 border border-border/60 rounded-2xl overflow-hidden card-glow backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-400/10">
            <ArrowRightLeft className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <span className="text-foreground font-semibold text-sm">Latest Transactions</span>
        </div>
        {nodeStatus === "running" && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            LIVE
          </span>
        )}
      </div>

      <div className="divide-y divide-border/40">
        {recentTxs.length === 0 ? (
          nodeStatus === "running" ? (
            <>
              <TxSkeleton />
              <TxSkeleton />
              <TxSkeleton />
            </>
          ) : (
            <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
              <ArrowRightLeft className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Start Anvil to see transactions</p>
            </div>
          )
        ) : (
          recentTxs.map((tx) => (
            <div key={tx.hash} className="group flex items-center gap-3 px-5 py-3 hover:bg-accent/30 transition-all duration-200">
              <div className="flex-shrink-0 w-9 h-9 bg-violet-400/8 group-hover:bg-violet-400/15 rounded-xl flex items-center justify-center transition-colors">
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
                  <div className="text-[10px] text-violet-400 font-mono mt-0.5 truncate bg-violet-400/5 px-1.5 py-0.5 rounded-md w-fit border border-violet-400/10">
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

      <div className="border-t border-border/50 bg-accent/10">
        <Link
          href="/transactions"
          className="flex items-center justify-center gap-1.5 text-primary hover:text-primary/80 text-xs font-semibold py-3 transition-colors"
        >
          View all transactions <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
