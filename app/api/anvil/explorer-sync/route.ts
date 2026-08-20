import { resolveFromRequest } from "@/lib/activeProject";
import { listAnvilProcessesCached } from "@/lib/anvilProcess";
import { syncExplorer } from "@/lib/explorerStack";
import { assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

async function chainIdOf(port: number): Promise<number | null> {
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
}

/**
 * Point the explorer at the node that is running right now, without waiting for
 * the background watcher. Recreates Blockscout with an empty database, so the
 * previous chain's blocks cannot linger.
 */
export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json().catch(() => ({}) as Record<string, unknown>);

        const active = resolveFromRequest(req);
        const listening = listAnvilProcessesCached();
        const candidate = listening.find((proc) => proc.port === active.port) ?? listening[0];

        const port = body.port !== undefined ?
            assertInt(body.port, "port", 1, 65535) :
            candidate?.port ?? active.port;

        const chainId = body.chainId !== undefined ?
            assertInt(body.chainId, "chainId", 1, Number.MAX_SAFE_INTEGER) :
            (await chainIdOf(port)) ?? active.chainId;

        return { started: true, sync: syncExplorer(chainId, port) };
    });
}
