import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Read-only guard for shared devnets.
 *
 * The control API can start and stop nodes, rewrite balances and storage, and
 * delete projects — none of which is safe to hand to everyone on a network. Set
 * DEVNET_READONLY=1 when exposing the stack over LAN to keep the explorer fully
 * usable while refusing anything that changes chain or project state.
 */
const READONLY = process.env.DEVNET_READONLY === "1" || process.env.DEVNET_READONLY === "true";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * POST endpoints that only read: the RPC proxy screens methods itself (see
 * app/api/rpc/route.ts), ABI lookup is a cache fill, and the simulator runs
 * inside a snapshot it always reverts.
 */
const READ_ONLY_POSTS = ["/api/rpc", "/api/abi/batch", "/api/simulate"];

export default function proxy(request: NextRequest) {
    if (!READONLY || SAFE_METHODS.has(request.method)) {
        return NextResponse.next();
    }

    const { pathname } = request.nextUrl;
    if (READ_ONLY_POSTS.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
        return NextResponse.next();
    }

    return NextResponse.json(
        {
            error: "This devnet is running in read-only mode (DEVNET_READONLY=1) — node control, " +
                "state patches and project changes are disabled.",
        },
        { status: 403 }
    );
}

export const config = {
    matcher: "/api/:path*",
};
