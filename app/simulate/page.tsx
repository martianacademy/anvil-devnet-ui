"use client";

import { CallSimulator } from "@/components/CallSimulator";

export default function SimulatePage() {
    return (
        <div className="p-4 max-w-4xl mx-auto space-y-4">
            <h1 className="text-white text-lg font-mono font-bold">Call Simulator</h1>
            <p className="text-gray-400 text-xs font-mono">
                Dry-run eth_call without affecting chain state. Uses evm_snapshot/evm_revert under the hood.
            </p>
            <CallSimulator />
        </div>
    );
}
