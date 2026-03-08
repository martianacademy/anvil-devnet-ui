"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface BlockRecord {
    number: number;
    hash: string;
    timestamp: number;
    txCount: number;
    gasUsed: string;
}

export default function BlocksPage() {
    const [blocks, setBlocks] = useState<BlockRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/explorer?module=block&action=getblocklist&page=1&offset=50")
            .then((r) => r.json())
            .then((data) => setBlocks(Array.isArray(data.result) ? data.result : []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-white text-lg font-mono font-bold">Blocks</h1>
                <Badge variant="secondary" className="font-mono text-xs">{blocks.length} blocks</Badge>
            </div>

            <Card className="bg-gray-950 border-gray-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm font-mono">Recent Blocks</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-gray-500 text-xs font-mono">Loading…</p>
                    ) : blocks.length === 0 ? (
                        <p className="text-gray-500 text-xs font-mono">No blocks found. Start anvil and mine some blocks.</p>
                    ) : (
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-gray-400 border-b border-gray-800">
                                    <th className="text-left py-1 pr-4">Block</th>
                                    <th className="text-left py-1 pr-4">Hash</th>
                                    <th className="text-left py-1 pr-4">Timestamp</th>
                                    <th className="text-left py-1 pr-4">TXs</th>
                                    <th className="text-left py-1">Gas Used</th>
                                </tr>
                            </thead>
                            <tbody>
                                {blocks.map((b) => (
                                    <tr key={b.hash} className="border-b border-gray-900 hover:bg-gray-900">
                                        <td className="py-1 pr-4 text-blue-400">{b.number}</td>
                                        <td className="py-1 pr-4 text-gray-400 truncate max-w-[200px]">{b.hash?.slice(0, 18)}…</td>
                                        <td className="py-1 pr-4 text-gray-300">{b.timestamp ? new Date(Number(b.timestamp) * 1000).toLocaleTimeString() : "—"}</td>
                                        <td className="py-1 pr-4">
                                            <Badge variant="secondary" className="text-xs">{b.txCount ?? 0}</Badge>
                                        </td>
                                        <td className="py-1 text-gray-400">{b.gasUsed ?? "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
