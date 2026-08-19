"use client";

import { useDevnetStore } from "@/store/useDevnetStore";
import { useProjectStore } from "@/store/useProjectStore";
import { HeroSection, StatsBar, LatestBlocks, LatestTransactions } from "@/components/Dashboard";
import { explorer } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { formatGwei } from "@/lib/format";

interface BlockRow {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  gasUsed: string;
}

const BLOCKS_SHOWN = 6;

export default function DashboardPage() {
  const { nodeStatus, latestBlock, chainId, port, transactions, gasPrice, lanIp } = useDevnetStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const localRpcUrl = `http://127.0.0.1:${port}`;
  const lanRpcUrl = lanIp ? `http://${lanIp}:${port}` : null;

  // Node status is polled by the navbar; this only refreshes the two feed cards,
  // re-running whenever the tip advances or the target chain/project changes.
  const { data, loading } = useAsyncData(
    async () => {
      if (nodeStatus !== "running") return { blocks: [] as BlockRow[], txTotal: null as number | null };
      const [blockList, txList] = await Promise.all([
        explorer<BlockRow[]>(`module=block&action=getblocklist&page=1&offset=${BLOCKS_SHOWN}`, []),
        explorer<unknown[]>("module=tx&action=getrecentlist&limit=1", []),
      ]);
      return { blocks: blockList.result, txTotal: txList.total };
    },
    [nodeStatus, chainId, latestBlock, activeProjectId],
    { blocks: [] as BlockRow[], txTotal: null as number | null }
  );

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
        txCount={data.txTotal ?? transactions.length}
        gasPrice={gasPrice ? formatGwei(gasPrice) : "—"}
        nodeStatus={nodeStatus}
      />
      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <LatestBlocks blocks={data.blocks} nodeStatus={nodeStatus} loading={loading} />
        <LatestTransactions transactions={transactions} nodeStatus={nodeStatus} loading={loading} />
      </div>
      {activeProjectId && (
        <p className="max-w-5xl mx-auto px-4 pb-6 text-[11px] font-mono text-muted-foreground">
          Scoped to project <span className="text-primary">{activeProjectId}</span>
        </p>
      )}
    </div>
  );
}
