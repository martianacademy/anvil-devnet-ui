import { NextResponse } from "next/server";
import { resolveFromRequest } from "@/lib/activeProject";

const READONLY = process.env.DEVNET_READONLY === "1" || process.env.DEVNET_READONLY === "true";

/**
 * Namespaces that change chain state. In read-only mode the proxy still serves
 * eth_*, net_*, web3_* and debug_trace* so the explorer works, but refuses these.
 */
const MUTATING_METHOD = /^(anvil_|evm_|hardhat_|miner_|personal_|txpool_|debug_(?!trace))/;

function isBlocked(body: unknown): boolean {
    if (!READONLY) {
        return false;
    }
    const calls = Array.isArray(body) ? body : [ body ];
    return calls.some((call) => {
        const method = (call as { method?: string } | null)?.method;
        return typeof method === "string" && MUTATING_METHOD.test(method);
    });
}

/** Thin pass-through to the active local node so the browser never needs the port. */
export async function POST(req: Request) {
    try {
        const body = await req.json();

        if (isBlocked(body)) {
            return NextResponse.json(
                { error: "State-changing RPC methods are disabled in read-only mode (DEVNET_READONLY=1)." },
                { status: 403 }
            );
        }

        const { port } = resolveFromRequest(req);
        const response = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            return NextResponse.json({ error: `Node returned HTTP ${response.status}` }, { status: 502 });
        }
        return NextResponse.json(await response.json());
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json(
            { error: `Cannot reach the local node: ${message}` },
            { status: 503 }
        );
    }
}
