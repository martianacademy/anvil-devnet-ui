"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Snapshot {
    id: string;
    label: string;
    block_number: number;
    created_at: number;
}

export function SnapshotList() {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [label, setLabel] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const load = async () => {
        const data = await fetch("/api/anvil/snapshot").then((r) => r.json());
        setSnapshots(Array.isArray(data) ? data : []);
    };

    useEffect(() => { load(); }, []);

    const takeSnapshot = async () => {
        setLoading(true);
        try {
            await fetch("/api/anvil/snapshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: label || `Snapshot ${Date.now()}` }),
            });
            setLabel("");
            setStatus("✓ Snapshot taken");
            load();
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
        finally { setLoading(false); }
    };

    const revert = async (id: string) => {
        try {
            await fetch("/api/anvil/revert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            setStatus(`✓ Reverted to snapshot ${id}`);
            load();
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">📸 EVM Snapshots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <Input
                        className="h-8 bg-gray-800 border-gray-600 text-white text-xs"
                        placeholder="Snapshot label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                    />
                    <Button size="sm" onClick={takeSnapshot} disabled={loading}>
                        Take Snapshot
                    </Button>
                </div>
                {status && <p className="text-green-400 text-xs">{status}</p>}
                {snapshots.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow className="border-gray-700">
                                <TableHead className="text-gray-400 text-xs">ID</TableHead>
                                <TableHead className="text-gray-400 text-xs">Label</TableHead>
                                <TableHead className="text-gray-400 text-xs">Block</TableHead>
                                <TableHead className="text-gray-400 text-xs"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {snapshots.map((s) => (
                                <TableRow key={s.id} className="border-gray-800">
                                    <TableCell className="font-mono text-xs text-gray-300">{s.id}</TableCell>
                                    <TableCell className="text-xs text-white">{s.label}</TableCell>
                                    <TableCell className="font-mono text-xs text-gray-300">{s.block_number}</TableCell>
                                    <TableCell>
                                        <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => revert(s.id)}>
                                            Revert
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-gray-500 text-xs">No snapshots yet</p>
                )}
            </CardContent>
        </Card>
    );
}
