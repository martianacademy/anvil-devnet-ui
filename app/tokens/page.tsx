"use client";

import { TokenTracker } from "@/components/TokenTracker";

export default function TokensPage() {
    return (
        <div className="p-4 max-w-4xl mx-auto space-y-4">
            <h1 className="text-white text-lg font-mono font-bold">Token Tracker</h1>
            <TokenTracker />
        </div>
    );
}
