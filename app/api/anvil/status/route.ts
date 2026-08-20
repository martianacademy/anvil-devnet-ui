import os from "os";
import { getAnvilState, isAnvilRunning } from "@/lib/anvilProcess";
import { resolveFromRequest } from "@/lib/activeProject";
import { getExplorerSyncState } from "@/lib/explorerStack";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

function getLanIp(): string | null {
    for (const addrs of Object.values(os.networkInterfaces())) {
        for (const iface of addrs ?? []) {
            if (iface.family === "IPv4" && !iface.internal) return iface.address;
        }
    }
    return null;
}

interface Probe {
    blockNumber: number;
    chainId: number;
    gasPrice: string | null;
}

/** One batched round trip: is anything alive on this port, and what is it? */
async function probePort(port: number): Promise<Probe | null> {
    try {
        const res = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
                { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 0 },
                { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 },
                { jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 2 },
            ]),
            signal: AbortSignal.timeout(800),
        });
        if (!res.ok) return null;
        const rows = (await res.json()) as { id: number; result?: string }[];
        if (!Array.isArray(rows)) return null;
        const byId = new Map(rows.map((r) => [r.id, r.result]));
        const blockHex = byId.get(0);
        if (!blockHex) return null;
        return {
            blockNumber: parseInt(blockHex, 16),
            chainId: byId.get(1) ? parseInt(byId.get(1) as string, 16) : 31337,
            gasPrice: byId.get(2) ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * The node the explorer's indexer is pointed at. A node running anywhere else is
 * invisible to Blockscout, which is a confusing failure to debug from the UI.
 */
const EXPLORER_RPC_PORT = Number(process.env.DEVNET_RPC_PORT ?? 8545) || 8545;
const EXPLORER_CHAIN_ID = Number(process.env.DEVNET_CHAIN_ID ?? 31337) || 31337;

export async function GET(req: Request) {
    return handleRoute(async () => {
        const active = resolveFromRequest(req);
        const state = getAnvilState(active.projectId ?? undefined);

        // Probe the resolved port first, then the configured default as a fallback
        // (covers an anvil started outside the UI).
        const fallbackPort = Number(process.env.DEVNET_RPC_PORT ?? 8545) || 8545;
        const ports = [...new Set([active.port, fallbackPort])];
        const probes = await Promise.all(ports.map(probePort));
        const index = probes.findIndex((p) => p !== null);
        const probe = index === -1 ? null : probes[index];

        const running = probe !== null || isAnvilRunning(active.projectId ?? undefined);
        const port = index === -1 ? active.port : ports[index];
        const chainId = probe?.chainId ?? active.chainId;

        return {
            running,
            managed: isAnvilRunning(active.projectId ?? undefined),
            pid: state.proc?.pid ?? null,
            port,
            chainId,
            blockNumber: probe?.blockNumber ?? 0,
            gasPrice: probe?.gasPrice ?? null,
            lanIp: getLanIp(),
            rpcUrl: `http://127.0.0.1:${port}`,
            uptime: state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
            projectId: active.projectId,
            lastError: state.lastError,
            config: state.config ? { ...state.config, port, chainId } : null,
            explorer: {
                rpcPort: EXPLORER_RPC_PORT,
                chainId: EXPLORER_CHAIN_ID,
                /** False when this node is running somewhere the indexer is not watching. */
                indexed: !running || port === EXPLORER_RPC_PORT,
                sync: getExplorerSyncState(),
            },
        };
    });
}
