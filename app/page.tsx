"use client";

import { useEffect } from "react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { AnvilControls } from "@/components/AnvilControls";
import { TxList } from "@/components/TxList";
import { SnapshotList } from "@/components/SnapshotList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { nodeStatus, latestBlock, chainId, port, transactions, setNodeStatus, setLatestBlock } = useDevnetStore();

  useEffect(() => {
    fetch("/api/anvil/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.running) {
          setNodeStatus("running");
          setLatestBlock(data.blockNumber);
        }
      })
      .catch(() => { });
  }, []);

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="pt-4">
            <div className="text-gray-400 text-xs font-mono">Chain ID</div>
            <div className="text-white text-2xl font-mono font-bold">{chainId}</div>
            <div className="text-gray-500 text-xs font-mono">Port: {port}</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="pt-4">
            <div className="text-gray-400 text-xs font-mono">Latest Block</div>
            <div className="text-white text-2xl font-mono font-bold">{latestBlock}</div>
            <div className="text-gray-500 text-xs font-mono">Pending: 0</div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="pt-4">
            <div className="text-gray-400 text-xs font-mono">Status</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={nodeStatus === "running" ? "default" : nodeStatus === "error" ? "destructive" : "secondary"}>
                {nodeStatus.toUpperCase()}
              </Badge>
            </div>
            <div className="text-gray-500 text-xs font-mono mt-1">TXs: {transactions.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-3">
          <AnvilControls />
          <SnapshotList />
        </div>
        <div className="col-span-3">
          <Card className="bg-gray-950 border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm font-mono">Live Transactions</CardTitle>
                {nodeStatus === "running" && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-green-400 text-xs">LIVE</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <TxList />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
