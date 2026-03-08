"use client";

import { PatchesPanel } from "@/components/PatchesPanel";
import { ChainProfileSelector } from "@/components/ChainProfileSelector";

export default function PatchesPage() {
    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-semibold text-foreground">State Patches</h1>
                <p className="text-muted-foreground text-xs mt-0.5">Fund wallets, patch ERC20 balances and storage slots</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                    <PatchesPanel />
                </div>
                <div>
                    <ChainProfileSelector />
                </div>
            </div>
        </div>
    );
}
