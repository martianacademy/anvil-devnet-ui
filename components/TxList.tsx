"use client";

import { useEffect, useRef } from "react";
import { useDevnetStore, type TxSummary } from "@/store/useDevnetStore";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

function truncate(s: string, len = 10) {
    if (!s) return "—";
    if (s.length <= len + 2) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function formatValue(hex: string): string {
    if (!hex || hex === "0x0" || hex === "0x") return "0";
    try {
        const wei = BigInt(hex);
        const eth = Number(wei) / 1e18;
        return eth.toFixed(4);
    } catch {
        return hex;
    }
}

function formatGas(hex: string | null): string {
    if (!hex) return "—";
    try {
        return parseInt(hex, 16).toLocaleString();
    } catch {
        return hex;
    }
}

export function TxList() {
    const { transactions, nodeStatus, addTransactions, setLatestBlock, chainId } = useDevnetStore();
    const eventSourceRef = useRef<EventSource | null>(null);

    // Hydrate from DB whenever node starts (or on initial mount if already running).
    // This ensures transactions recorded in previous sessions / browser tabs are visible
    // immediately rather than only appearing via the live SSE stream.
    useEffect(() => {
        if (nodeStatus !== "running") return;
        fetch(`/api/explorer?module=tx&action=getrecentlist&limit=200`)
            .then((r) => r.json())
            .then((d) => {
                if (Array.isArray(d.result)) {
                    addTransactions(
                        (d.result as any[]).map((tx) => ({
                            hash: tx.hash,
                            block_number: tx.block_number,
                            block_timestamp: tx.block_timestamp,
                            from_address: tx.from_address,
                            to_address: tx.to_address,
                            value: tx.value,
                            gas_used: tx.gas_used,
                            status: tx.status,
                            decoded_function: tx.decoded_function,
                            input: tx.input,
                        }))
                    );
                }
            })
            .catch(() => { });
    }, [nodeStatus, chainId]);

    useEffect(() => {
        if (nodeStatus !== "running") return;

        const es = new EventSource("/api/stream");
        eventSourceRef.current = es;

        es.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === "tx") {
                addTransactions([{
                    hash: data.hash,
                    block_number: data.blockNumber,
                    block_timestamp: Date.now() / 1000,
                    from_address: data.from,
                    to_address: data.to,
                    value: data.value,
                    gas_used: data.gasUsed,
                    status: data.status === "success" ? 1 : 0,
                    decoded_function: data.decodedFunction,
                    input: null,
                }]);
            } else if (data.type === "block") {
                setLatestBlock(data.number);
            }
        };

        return () => {
            es.close();
            eventSourceRef.current = null;
        };
    }, [nodeStatus]);

    if (nodeStatus !== "running") {
        return (
            <div className="text-gray-500 text-sm text-center py-8">
                Start Anvil to see live transactions
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className="text-gray-500 text-sm text-center py-8">
                Waiting for transactions…
            </div>
        );
    }

    return (
        <ScrollArea className="h-[500px]">
            <Table>
                <TableHeader>
                    <TableRow className="border-gray-700">
                        <TableHead className="text-gray-400 font-mono text-xs">Block</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">Tx Hash</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">From</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">To</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">Method</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">Value</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">Gas</TableHead>
                        <TableHead className="text-gray-400 font-mono text-xs">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((tx) => (
                        <TableRow key={tx.hash} className="border-gray-800 hover:bg-gray-800/50">
                            <TableCell className="font-mono text-xs text-gray-300">
                                {tx.block_number}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                                <Tooltip>
                                    <TooltipTrigger>
                                        <Link
                                            href={`/tx/${tx.hash}`}
                                            className="text-blue-400 hover:text-blue-300 underline"
                                        >
                                            {truncate(tx.hash)}
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent className="font-mono text-xs">{tx.hash}</TooltipContent>
                                </Tooltip>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-gray-300">
                                <Tooltip>
                                    <TooltipTrigger>{truncate(tx.from_address)}</TooltipTrigger>
                                    <TooltipContent className="font-mono text-xs">{tx.from_address}</TooltipContent>
                                </Tooltip>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-gray-300">
                                <Tooltip>
                                    <TooltipTrigger>{truncate(tx.to_address ?? "")}</TooltipTrigger>
                                    <TooltipContent className="font-mono text-xs">{tx.to_address ?? "Contract Creation"}</TooltipContent>
                                </Tooltip>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-purple-300">
                                {tx.decoded_function ?? (tx.input && tx.input.length > 10 ? tx.input.slice(0, 10) : "transfer")}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-gray-300">
                                {formatValue(tx.value)} ETH
                            </TableCell>
                            <TableCell className="font-mono text-xs text-gray-400">
                                {formatGas(tx.gas_used)}
                            </TableCell>
                            <TableCell>
                                <Badge variant={tx.status === 1 ? "default" : "destructive"} className="text-xs">
                                    {tx.status === 1 ? "✓" : "✗"}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </ScrollArea>
    );
}
