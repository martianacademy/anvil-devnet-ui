/**
 * Keeps the explorer following the node.
 *
 * Blockscout is configured when its containers start, so a node that comes up on a
 * different port or chain id — from the UI, a script, or a terminal — would be
 * silently unindexed. This watcher notices and reconfigures the stack.
 */
export async function register() {
    // Only in the Node runtime: the edge runtime has no child_process.
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    if (process.env.DEVNET_EXPLORER_AUTOSYNC === "0") return;

    const { listAnvilProcessesCached } = await import("./lib/anvilProcess.ts");
    const { followNode } = await import("./lib/explorerStack.ts");

    const WATCH_INTERVAL_MS = 10_000;

    /**
     * Chain id and, if the node is a fork, the block it forked at.
     *
     * The fork block has to travel with the follow. Without it the explorer is
     * rebuilt starting from block 0, and on a fork that means indexing the whole
     * upstream chain — the watcher would quietly undo what starting the node got
     * right, ten seconds later.
     */
    const identityOf = async (port: number): Promise<{ chainId: number; forkBlockNumber: number | null } | null> => {
        try {
            const res = await fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify([
                    { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 0 },
                    { jsonrpc: "2.0", method: "anvil_nodeInfo", params: [], id: 1 },
                ]),
                signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) return null;
            const rows = await res.json() as Array<{ id: number; result?: unknown }>;
            if (!Array.isArray(rows)) return null;
            const byId = new Map(rows.map((row) => [ row.id, row.result ]));

            const chainId = parseInt(String(byId.get(0)), 16);
            if (!Number.isFinite(chainId)) return null;

            const info = byId.get(1) as { forkConfig?: { forkBlockNumber?: number | null } } | undefined;
            return { chainId, forkBlockNumber: info?.forkConfig?.forkBlockNumber ?? null };
        } catch {
            return null;
        }
    };

    const tick = async () => {
        const listening = listAnvilProcessesCached();
        if (listening.length === 0) return;

        // With several nodes up, the one this app manages wins; otherwise the first.
        const target = listening.find((proc) => proc.managed) ?? listening[0];
        const identity = await identityOf(target.port);
        if (identity === null) return;

        followNode({ ...identity, port: target.port });
    };

    setInterval(() => void tick().catch(() => { }), WATCH_INTERVAL_MS).unref?.();
    void tick().catch(() => { });
}
