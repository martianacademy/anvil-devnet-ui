"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Profile {
    id: number;
    name: string;
    chainId: number;
    forkUrl?: string;
    is_active: number;
}

export function ChainProfileSelector() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selected, setSelected] = useState("");
    const [status, setStatus] = useState("");

    const load = async () => {
        const data = await fetch("/api/patches/profiles").then((r) => r.json());
        setProfiles(data.profiles ?? []);
    };

    useEffect(() => { load(); }, []);

    const activate = async (name: string) => {
        try {
            await fetch("/api/patches/profiles", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            setStatus(`✓ Profile "${name}" activated`);
            load();
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    const loadPreset = async (presetName: string) => {
        try {
            const data = await fetch("/api/patches/profiles").then((r) => r.json());
            const preset = data.presets?.find((p: any) => p.name === presetName);
            if (!preset) return;
            await fetch("/api/patches/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(preset),
            });
            setStatus(`✓ Preset "${presetName}" saved`);
            load();
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                <span className="text-sm font-semibold text-foreground">Chain Profiles</span>
            </div>
            <div className="p-4 space-y-4">
                <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-xs">Quick presets</p>
                    {["BSC Mainnet Fork", "opBNB Fork", "ETH Mainnet Fork", "Local Clean"].map((name) => (
                        <Button
                            key={name}
                            size="sm"
                            variant="outline"
                            className="w-full justify-start text-xs h-8"
                            onClick={() => loadPreset(name)}
                        >
                            {name}
                        </Button>
                    ))}
                </div>

                {profiles.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">Saved profiles</p>
                        {profiles.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                                {p.is_active ? (
                                    <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] px-1.5">active</Badge>
                                ) : (
                                    <button
                                        className="text-[10px] text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors"
                                        onClick={() => activate(p.name)}
                                    >
                                        Use
                                    </button>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-foreground truncate">{p.name}</p>
                                    <p className="text-[10px] text-muted-foreground">Chain {p.chainId}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {status && (
                    <div className={`rounded-lg px-3 py-2 text-xs font-mono border ${status.startsWith("Error")
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-green-500/10 border-green-500/30 text-green-400"
                        }`}>{status}</div>
                )}
            </div>
        </div>
    );
}
