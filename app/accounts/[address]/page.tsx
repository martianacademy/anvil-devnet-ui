"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, FileCode, Hash, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton, DetailRow, Panel } from "@/components/ui/detail-row";
import { explorer, rpcCall } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { useDevnetStore } from "@/store/useDevnetStore";
import { formatEth, formatNumber, timeAgo, truncateHex } from "@/lib/format";

interface AddressSummary {
    balance: string;
    nonce: number;
    code: string;
}

interface TxRow {
    hash: string;
    block_number: number;
    block_timestamp: number;
    from_address: string;
    to_address: string | null;
    value: string;
    status: number;
    decoded_function: string | null;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export default function AddressDetailPage() {
    const params = useParams();
    const address = String(params.address ?? "");
    const valid = ADDRESS_RE.test(address);
    const latestBlock = useDevnetStore((s) => s.latestBlock);

    const { data: summary, loading } = useAsyncData<AddressSummary | null>(
        async () => {
            if (!valid) return null;
            const [balance, nonce, code] = await Promise.all([
                rpcCall<string>("eth_getBalance", [address, "latest"]),
                rpcCall<string>("eth_getTransactionCount", [address, "latest"]),
                rpcCall<string>("eth_getCode", [address, "latest"]),
            ]);
            return {
                balance: balance ?? "0x0",
                nonce: parseInt(nonce ?? "0x0", 16),
                code: code ?? "0x",
            };
        },
        [address, valid, latestBlock],
        null
    );

    const { data: txs } = useAsyncData<TxRow[]>(
        async () => {
            if (!valid) return [];
            const { result } = await explorer<TxRow[]>(
                `module=account&action=txlist&address=${address}&sort=desc&offset=25`,
                []
            );
            return result;
        },
        [address, valid, latestBlock],
        []
    );

    if (!valid) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <BackLink />
                <div className="rounded-xl border border-border bg-card p-8 text-center text-red-400 text-sm">
                    Not a valid address: <span className="break-all font-mono">{address}</span>
                </div>
            </div>
        );
    }

    const isContract = Boolean(summary?.code && summary.code !== "0x");

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            <BackLink />

            <div className="flex items-center gap-3 flex-wrap">
                <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                    {isContract ? <FileCode className="w-5 h-5 text-primary" /> : <Wallet className="w-5 h-5 text-primary" />}
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-foreground">{isContract ? "Contract" : "Address"}</h1>
                    <p className="text-muted-foreground text-xs font-mono break-all">{address}</p>
                </div>
                {isContract && (
                    <Link href={`/contracts/${address}`} className="ml-auto">
                        <Badge variant="secondary" className="text-xs cursor-pointer">View ABI →</Badge>
                    </Link>
                )}
            </div>

            <Panel title="Overview">
                <div className="px-5 pb-1">
                    <DetailRow label="Address" icon={<Hash className="w-3.5 h-3.5" />}>
                        <span className="text-emerald-400">{address}</span>
                        <CopyButton text={address} />
                    </DetailRow>
                    <DetailRow label="Balance" icon={<Coins className="w-3.5 h-3.5" />}>
                        <span className="text-foreground font-semibold">
                            {loading ? "…" : `${formatEth(summary?.balance, 9)} ETH`}
                        </span>
                    </DetailRow>
                    <DetailRow label="Nonce">
                        <span className="text-muted-foreground">{loading ? "…" : summary?.nonce ?? 0}</span>
                    </DetailRow>
                    <DetailRow label="Type">
                        <Badge variant="secondary" className="text-xs">
                            {isContract ? "Contract" : "Externally owned account"}
                        </Badge>
                    </DetailRow>
                    {isContract && (
                        <DetailRow label="Code Size" icon={<FileCode className="w-3.5 h-3.5" />}>
                            <span className="text-muted-foreground">
                                {formatNumber(Math.floor(((summary?.code.length ?? 2) - 2) / 2))} bytes
                            </span>
                        </DetailRow>
                    )}
                </div>
            </Panel>

            <Panel
                title="Transactions"
                action={<Badge variant="secondary" className="text-xs">{txs.length}</Badge>}
            >
                <div className="overflow-x-auto">
                    {txs.length === 0 ? (
                        <p className="p-5 text-muted-foreground text-sm">No indexed transactions for this address yet.</p>
                    ) : (
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border/60">
                                    <th className="text-left px-5 py-2.5 font-medium">Tx Hash</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Block</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Age</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Direction</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Counterparty</th>
                                    <th className="text-right px-4 py-2.5 font-medium">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {txs.map((tx) => {
                                    const outgoing = tx.from_address?.toLowerCase() === address.toLowerCase();
                                    const other = outgoing ? tx.to_address : tx.from_address;
                                    return (
                                        <tr key={tx.hash} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-5 py-2.5">
                                                <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline">
                                                    {truncateHex(tx.hash, 8, 6)}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Link href={`/blocks/${tx.block_number}`} className="text-foreground/80 hover:text-primary">
                                                    {tx.block_number}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">{timeAgo(tx.block_timestamp)}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={outgoing ? "text-amber-400" : "text-emerald-400"}>
                                                    {outgoing ? "OUT" : "IN"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {other ? (
                                                    <Link href={`/accounts/${other}`} className="text-primary/80 hover:underline">
                                                        {truncateHex(other)}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted-foreground">Contract Creation</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-foreground">{formatEth(tx.value, 6)} ETH</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </Panel>
        </div>
    );
}

function BackLink() {
    return (
        <Link href="/accounts" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Accounts
        </Link>
    );
}
