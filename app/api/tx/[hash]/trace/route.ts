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
        const jsonRpc = (method: string, rpcParams: unknown[]) =>
            fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method, params: rpcParams, id: Date.now() }),
            }).then((r) => r.json());

        // Try both tracers independently — either can fail on fork RPCs
        let callTrace = null;
        let structLogs: unknown[] = [];
        let traceError: string | null = null;

        const [callTraceRes, structLogsRes] = await Promise.allSettled([
            jsonRpc("debug_traceTransaction", [hash, { tracer: "callTracer" }]),
            jsonRpc("debug_traceTransaction", [hash, {
                disableStorage: false,
                disableMemory: false,
                disableStack: false,
            }]),
        ]);

        if (callTraceRes.status === "fulfilled" && !callTraceRes.value.error) {
            callTrace = callTraceRes.value.result ?? null;
        }

        if (structLogsRes.status === "fulfilled" && !structLogsRes.value.error) {
            structLogs = structLogsRes.value.result?.structLogs ?? [];
        }

        // If both failed, report the error
        if (!callTrace && structLogs.length === 0) {
            const err = structLogsRes.status === "fulfilled"
                ? structLogsRes.value.error?.message
                : "debug_traceTransaction failed";

            if (err?.includes("not available") || err?.includes("Fork Error")) {
                traceError = "Tracing unavailable: your fork RPC does not support debug_traceTransaction. Use a local chain or a paid RPC plan.";
            } else {
                traceError = err ?? "No trace data available for this transaction.";
            }
        }

        const result = { structLogs, callTrace, traceError };
        if (structLogs.length > 0 || callTrace) {
            saveTxTrace(hash, structLogs, callTrace);
        }
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
