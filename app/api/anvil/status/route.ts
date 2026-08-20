import os from "os";
import { getAnvilState, isAnvilRunning, listAnvilProcessesCached } from "@/lib/anvilProcess";
import { resolveFromRequest } from "@/lib/activeProject";
import { getExplorerSyncState, readExplorerConfig } from "@/lib/explorerStack";
import { observeConfig, rpcBatch } from "@/lib/nodeObserver";
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

/** Is anything alive on this port, and what is it? */
async function probePort(port: number): Promise<Probe | null> {
    const out = await rpcBatch(port, [
        { method: "eth_blockNumber", params: [] },
        { method: "eth_chainId", params: [] },
        { method: "eth_gasPrice", params: [] },
    ]);
    if (!out) return null;
    const blockHex = out[0] as string | null;
    if (!blockHex) return null;
    return {
        blockNumber: parseInt(blockHex, 16),
        chainId: out[1] ? parseInt(out[1] as string, 16) : 31337,
        gasPrice: (out[2] as string | null) ?? null,
    };
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

        // Probe the resolved port first, then every port an anvil is actually
        // listening on, then the conventional default. Relying on the configured
        // port alone made a node started on any other port look "stopped".
        const listening = listAnvilProcessesCached().map((proc) => proc.port);
        const ports = [...new Set([ active.port, ...listening, EXPLORER_RPC_PORT, 8545 ])];
        const probes = await Promise.all(ports.map(probePort));
        const index = probes.findIndex((p) => p !== null);
        const probe = index === -1 ? null : probes[index];

        const running = probe !== null || isAnvilRunning(active.projectId ?? undefined);
        const explorerConfig = readExplorerConfig();
        const port = index === -1 ? active.port : ports[index];
        const chainId = probe?.chainId ?? active.chainId;

        // Prefer what the live node reports over what this process remembers
        // starting: they diverge the moment anyone restarts Anvil by hand.
        const observed = probe ? await observeConfig(port, probe.blockNumber, chainId) : null;
        const sameNode = state.config?.port === observed?.port;
        const config = observed ?
            // Block time cannot be read back off a node, so a managed process is the
            // only place its real value survives. Everything else comes off the wire.
            { ...observed, blockTime: observed.blockTime ?? (sameNode ? state.config?.blockTime ?? null : null) } :
            state.config ? { ...state.config, port, chainId } : null;

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
            config,
            /** Where `config` came from, so the UI can say so instead of implying it is settable. */
            configSource: observed ? "node" : state.config ? "managed" : null,
            explorer: {
                // Read from the container, not this process's env: the two drift as
                // soon as the stack is reconfigured for a different node.
                rpcPort: explorerConfig.port ?? EXPLORER_RPC_PORT,
                chainId: explorerConfig.chainId ?? EXPLORER_CHAIN_ID,
                /** False when this node is running somewhere the indexer is not watching. */
                indexed: !running || (explorerConfig.port ?? EXPLORER_RPC_PORT) === port,
                sync: getExplorerSyncState(),
            },
        };
    });
}
