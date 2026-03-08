"use client";

import { TokenTracker } from "@/components/TokenTracker";

export default function TokensPage() {
    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-semibold text-foreground">Token Tracker</h1>
                <p className="text-muted-foreground text-xs mt-0.5">Watch ERC20 / ERC721 balances live</p>
            </div>
            <TokenTracker />
        </div>
    );
}
