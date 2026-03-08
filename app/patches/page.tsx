"use client";

import { PatchesPanel } from "@/components/PatchesPanel";
import { ChainProfileSelector } from "@/components/ChainProfileSelector";

export default function PatchesPage() {
    return (
        <div className="p-4 max-w-5xl mx-auto space-y-4">
            <h1 className="text-white text-lg font-mono font-bold">State Patches</h1>
            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                    <PatchesPanel />
                </div>
                <div>
                    <ChainProfileSelector />
                </div>
            </div>
        </div>
    );
}
