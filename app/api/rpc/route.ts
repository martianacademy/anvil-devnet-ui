import { NextResponse } from "next/server";
import { resolveFromRequest } from "@/lib/activeProject";

/** Thin pass-through to the active local node so the browser never needs the port. */
export async function POST(req: Request) {
    try {
        const body = await req.json();
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
