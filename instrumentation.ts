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

    const chainIdOf = async (port: number): Promise<number | null> => {
        try {
            const res = await fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
                signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) return null;
            const data = await res.json();
            const chainId = parseInt(data.result, 16);
            return Number.isFinite(chainId) ? chainId : null;
        } catch {
            return null;
        }
    };

    const tick = async () => {
        const listening = listAnvilProcessesCached();
        if (listening.length === 0) return;

        // With several nodes up, the one this app manages wins; otherwise the first.
        const target = listening.find((proc) => proc.managed) ?? listening[0];
        const chainId = await chainIdOf(target.port);
        if (chainId === null) return;

        followNode({ chainId, port: target.port });
    };

    setInterval(() => void tick().catch(() => { }), WATCH_INTERVAL_MS).unref?.();
    void tick().catch(() => { });
}
