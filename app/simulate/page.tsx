"use client";

import { CallSimulator } from "@/components/CallSimulator";

export default function SimulatePage() {
    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-semibold text-foreground">Call Simulator</h1>
                <p className="text-muted-foreground text-xs mt-0.5">Dry-run eth_call without affecting chain state via evm_snapshot/evm_revert</p>
            </div>
            <CallSimulator />
        </div>
    );
}
