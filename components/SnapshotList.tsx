"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { useDevnetStore } from "@/store/useDevnetStore";
import { timeAgo } from "@/lib/format";

interface Snapshot {
    id: string;
    label: string;
    block_number: number;
    created_at: number;
}

export function SnapshotList() {
    const { toast } = useToast();
    const setLatestBlock = useDevnetStore((s) => s.setLatestBlock);
    const [label, setLabel] = useState("");
    const [busy, setBusy] = useState(false);

    const { data: snapshots, loading, reload } = useAsyncData(
        () => api.get<Snapshot[]>("/api/anvil/snapshot"),
        [],
        [] as Snapshot[]
    );

    const take = async () => {
        setBusy(true);
        try {
            const snap = await api.post<{ id: string; label: string; blockNumber: number }>(
                "/api/anvil/snapshot",
                { label: label.trim() || undefined }
            );
            toast(`Snapshot ${snap.id} taken at block #${snap.blockNumber}`, "success");
            setLabel("");
            reload();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not take snapshot", "error");
        } finally {
            setBusy(false);
        }
    };

    const revert = async (snapshot: Snapshot) => {
        setBusy(true);
        try {
            const res = await api.post<{ success: boolean; blockNumber?: number; error?: string }>("/api/anvil/revert", { id: snapshot.id });
            if (!res.success) {
                toast(res.error ?? "Snapshot no longer exists", "error");
            } else {
                if (res.blockNumber !== undefined) setLatestBlock(res.blockNumber);
                toast(`Reverted to "${snapshot.label}"`, "success");
            }
            reload();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Revert failed", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">📸 EVM Snapshots</span>
                <Badge variant="secondary" className="text-xs">{snapshots.length}</Badge>
            </div>
            <div className="p-4 space-y-3">
                <div className="flex gap-2">
                    <Input
                        className="h-9 text-sm"
                        placeholder="Snapshot label (optional)"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                    />
                    <Button size="sm" onClick={take} disabled={busy}>Take Snapshot</Button>
                </div>

                <p className="text-muted-foreground text-[11px]">
                    Reverting consumes the snapshot and every snapshot taken after it.
                </p>

                {loading ? (
                    <p className="text-muted-foreground text-xs">Loading…</p>
                ) : snapshots.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No snapshots yet.</p>
                ) : (
                    <div className="space-y-1">
                        {snapshots.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                                <Badge variant="outline" className="font-mono text-[10px]">{s.id}</Badge>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-foreground truncate">{s.label}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">
                                        block #{s.block_number} · {timeAgo(Math.floor(s.created_at / 1000))}
                                    </p>
                                </div>
                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => revert(s)}>
                                    Revert
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
