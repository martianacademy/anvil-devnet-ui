import Link from "next/link";
import { Blocks, Clock, TrendingUp, ChevronRight } from "lucide-react";

interface BlockRow {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  gasUsed: string;
}

interface LatestBlocksProps {
  blocks: BlockRow[];
  nodeStatus: string;
}

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function BlockSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="w-9 h-9 skeleton rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="w-16 h-3.5 skeleton" />
        <div className="w-24 h-2.5 skeleton" />
      </div>
      <div className="space-y-2 text-right">
        <div className="w-12 h-3 skeleton ml-auto" />
        <div className="w-20 h-2.5 skeleton ml-auto" />
      </div>
    </div>
  );
}

export function LatestBlocks({ blocks, nodeStatus }: LatestBlocksProps) {
  return (
    <div className="bg-card/80 border border-border/60 rounded-2xl overflow-hidden card-glow backdrop-blur-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Blocks className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-foreground font-semibold text-sm">Latest Blocks</span>
        </div>
        {nodeStatus === "running" && (
          <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            LIVE
          </span>
        )}
      </div>

      <div className="divide-y divide-border/40">
        {blocks.length === 0 ? (
          nodeStatus === "running" ? (
            <>
              <BlockSkeleton />
              <BlockSkeleton />
              <BlockSkeleton />
            </>
          ) : (
            <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
              <Blocks className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Start Anvil to see blocks</p>
            </div>
          )
        ) : (
          blocks.map((b) => (
            <div key={b.number} className="group flex items-center gap-3 px-5 py-3 hover:bg-accent/30 transition-all duration-200">
              <div className="flex-shrink-0 w-9 h-9 bg-primary/8 group-hover:bg-primary/15 rounded-xl flex items-center justify-center transition-colors">
                <Blocks className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/blocks/${b.number}`} className="text-primary hover:underline font-mono text-sm font-bold">
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

      <div className="border-t border-border/50 bg-accent/10">
        <Link
          href="/blocks"
          className="flex items-center justify-center gap-1.5 text-primary hover:text-primary/80 text-xs font-semibold py-3 transition-colors"
        >
          View all blocks <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
