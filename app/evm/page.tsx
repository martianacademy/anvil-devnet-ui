"use client";

import { EvmControls } from "@/components/EvmControls";

export default function EvmPage() {
    return (
        <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-semibold text-foreground">EVM Control Panel</h1>
                <p className="text-muted-foreground text-xs mt-0.5">Mine blocks, travel time, impersonate accounts</p>
            </div>
            <EvmControls />
        </div>
    );
}
