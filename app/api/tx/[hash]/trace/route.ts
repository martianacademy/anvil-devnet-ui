import { NextResponse } from "next/server";
import { getTxTrace, saveTxTrace } from "@/lib/txStore";
import { getAnvilState } from "@/lib/anvilProcess";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ hash: string }> }
) {
    try {
        const { hash } = await params;

        // Check cache
        const cached = getTxTrace(hash);
        if (cached) return NextResponse.json(cached);

        // Fetch from anvil
        const port = getAnvilState().config?.port ?? 8545;
        const jsonRpc = (method: string, params: unknown[]) =>
            fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
            }).then((r) => r.json());

        const [callTraceRes, structLogsRes] = await Promise.all([
            jsonRpc("debug_traceTransaction", [hash, { tracer: "callTracer" }]),
            jsonRpc("debug_traceTransaction", [hash, {
                disableStorage: false,
                disableMemory: false,
                disableStack: false,
            }]),
        ]);

        const callTrace = callTraceRes.result ?? null;
        const structLogs = structLogsRes.result?.structLogs ?? [];

        saveTxTrace(hash, structLogs, callTrace);
        return NextResponse.json({ structLogs, callTrace });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
