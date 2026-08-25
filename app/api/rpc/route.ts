import { NextResponse } from "next/server";
import { resolveFromRequest } from "@/lib/activeProject";

const READONLY = process.env.DEVNET_READONLY === "1" || process.env.DEVNET_READONLY === "true";

/**
 * Who may call this proxy from a browser.
 *
 * A dapp served from anywhere but this origin — a Vite dev server, a tunnel, a
 * phone — is a different origin, and without these headers the browser refuses
 * the request before the node ever sees it. `curl` does not enforce CORS, so the
 * proxy looks healthy from a terminal while every browser is blocked.
 *
 * Defaults to `*` because this is a local devnet tool, but stays configurable:
 * hardcoding it is how somebody ends up deploying this and finding out later.
 */
const ALLOWED_ORIGIN = process.env.DEVNET_RPC_ALLOWED_ORIGIN ?? "*";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    // Without this the browser preflights every single JSON-RPC call, which on a
    // page that reads a dozen values doubles the round trips.
    "Access-Control-Max-Age": "86400",
} as const;

/**
 * @dev Every response goes through here, including the error ones. Attaching the
 *      headers only to success would leave a failing call looking like a network
 *      error in the browser instead of showing the reason the proxy gave.
 */
function reply(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** The preflight a browser sends before any cross-origin JSON-RPC POST. */
export async function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
}

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
            return reply(
                { error: "State-changing RPC methods are disabled in read-only mode (DEVNET_READONLY=1)." },
                403
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
            return reply({ error: `Node returned HTTP ${response.status}` }, 502);
        }
        return reply(await response.json());
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return reply({ error: `Cannot reach the local node: ${message}` }, 503);
    }
}
