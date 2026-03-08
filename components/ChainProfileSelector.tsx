"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">Chain Profiles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                    {["BSC Mainnet Fork", "opBNB Fork", "ETH Mainnet Fork", "Local Clean"].map((name) => (
                        <Button
                            key={name}
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => loadPreset(name)}
                        >
                            {name}
                        </Button>
                    ))}
                </div>
                {profiles.length > 0 && (
                    <div className="space-y-1">
                        {profiles.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 text-xs">
                                {p.is_active ? (
                                    <Badge className="bg-green-700 text-xs">active</Badge>
                                ) : (
                                    <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={() => activate(p.name)}>
                                        Use
                                    </Button>
                                )}
                                <span className="text-white">{p.name}</span>
                                <span className="text-gray-400">Chain {p.chainId}</span>
                                {p.forkUrl && <span className="text-blue-300 truncate max-w-[150px]">{p.forkUrl}</span>}
                            </div>
                        ))}
                    </div>
                )}
                {status && <p className="text-green-400 text-xs">{status}</p>}
            </CardContent>
        </Card>
    );
}
