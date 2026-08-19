"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { useDevnetStore } from "@/store/useDevnetStore";

export interface ChainProfile {
    id: number;
    name: string;
    chainId: number;
    forkUrl?: string;
    forkBlockNumber?: number;
    blockTime: number;
    baseFee: number;
    port: number;
    accounts: number;
    balance: number;
    is_active: number;
}

interface ProfilesResponse {
    profiles: ChainProfile[];
    presets: Omit<ChainProfile, "id" | "is_active">[];
}

export function ChainProfileSelector() {
    const { toast } = useToast();
    const setNodeConfig = useDevnetStore((s) => s.setNodeConfig);

    const { data, loading, reload } = useAsyncData(
        () => api.get<ProfilesResponse>("/api/patches/profiles"),
        [],
        { profiles: [] as ChainProfile[], presets: [] as ProfilesResponse["presets"] }
    );

    /** Mark the profile active and push its settings into the Anvil start form. */
    const activate = async (profile: ChainProfile) => {
        try {
            await api.patch("/api/patches/profiles", { name: profile.name });
            setNodeConfig({
                chainId: profile.chainId,
                port: profile.port,
                blockTime: profile.blockTime,
                baseFee: profile.baseFee,
                accounts: profile.accounts,
                balance: profile.balance,
                forkUrl: profile.forkUrl,
                forkBlockNumber: profile.forkBlockNumber,
            });
            toast(`Profile "${profile.name}" loaded into the start form`, "success");
            reload();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not activate profile", "error");
        }
    };

    const savePreset = async (preset: ProfilesResponse["presets"][number]) => {
        try {
            await api.post("/api/patches/profiles", preset);
            toast(`Preset "${preset.name}" saved`, "success");
            reload();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not save preset", "error");
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                <span className="text-sm font-semibold text-foreground">Chain Profiles</span>
            </div>
            <div className="p-4 space-y-4">
                <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-xs">Quick presets</p>
                    {data.presets.map((preset) => (
                        <Button
                            key={preset.name}
                            size="sm"
                            variant="outline"
                            className="w-full justify-start text-xs h-8"
                            onClick={() => savePreset(preset)}
                            disabled={loading}
                        >
                            {preset.name}
                        </Button>
                    ))}
                </div>

                {data.profiles.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">Saved profiles</p>
                        {data.profiles.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                                {p.is_active ? (
                                    <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5">
                                        active
                                    </Badge>
                                ) : (
                                    <button
                                        className="text-[10px] text-primary border border-primary/30 rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors"
                                        onClick={() => activate(p)}
                                    >
                                        Use
                                    </button>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-foreground truncate">{p.name}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Chain {p.chainId}{p.forkUrl ? " · fork" : ""}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
