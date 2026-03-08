"use client";

import type { CallNode } from "@/lib/traceParser";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface Props {
    node: CallNode;
    depth?: number;
}

const CALL_COLORS: Record<string, string> = {
    CALL: "text-blue-400",
    DELEGATECALL: "text-purple-400",
    STATICCALL: "text-cyan-400",
    CREATE: "text-yellow-400",
    CREATE2: "text-yellow-400",
};

function truncate(s: string) {
    if (!s) return "—";
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function CallNodeRow({ node, depth = 0 }: Props) {
    const [expanded, setExpanded] = useState(depth < 2);
    const hasChildren = (node.calls?.length ?? 0) > 0;
    const colorClass = CALL_COLORS[node.type?.toUpperCase()] ?? "text-gray-300";

    return (
        <div style={{ marginLeft: depth * 16 }} className="my-0.5">
            <div
                className="flex items-center gap-1 text-xs font-mono cursor-pointer hover:bg-gray-800/50 rounded px-1 py-0.5"
                onClick={() => hasChildren && setExpanded(!expanded)}
            >
                {hasChildren ? (
                    <span className="text-gray-400 w-4">{expanded ? "▼" : "▶"}</span>
                ) : (
                    <span className="w-4" />
                )}
                <Badge variant="outline" className={`text-xs px-1 py-0 ${colorClass} border-current`}>
                    {node.type?.toUpperCase() ?? "CALL"}
                </Badge>
                <span className="text-gray-300">{truncate(node.to ?? "")}</span>
                {node.input && node.input.length >= 10 && (
                    <span className="text-purple-300">{node.input.slice(0, 10)}</span>
                )}
                {node.value && node.value !== "0x0" && node.value !== "0" && (
                    <span className="text-yellow-300 ml-1">
                        {(Number(BigInt(node.value)) / 1e18).toFixed(4)} ETH
                    </span>
                )}
                {node.error && (
                    <Badge variant="destructive" className="text-xs">REVERT</Badge>
                )}
                {node.gasUsed && (
                    <span className="text-gray-500 ml-auto">{parseInt(node.gasUsed, 16).toLocaleString()} gas</span>
                )}
            </div>
            {expanded && hasChildren && (
                <div>
                    {node.calls!.map((child, i) => (
                        <CallNodeRow key={i} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function CallTree({ node }: { node: CallNode }) {
    return (
        <div className="bg-gray-900 border border-gray-700 rounded p-3">
            <CallNodeRow node={node} depth={0} />
        </div>
    );
}
