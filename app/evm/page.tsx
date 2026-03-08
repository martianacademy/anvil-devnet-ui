"use client";

import { EvmControls } from "@/components/EvmControls";

export default function EvmPage() {
    return (
        <div className="p-4 max-w-3xl mx-auto space-y-4">
            <h1 className="text-white text-lg font-mono font-bold">EVM Control Panel</h1>
            <EvmControls />
        </div>
    );
}
