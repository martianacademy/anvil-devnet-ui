import { getTxTrace, saveTxTrace } from "@/lib/txStore";
import { resolveFromRequest } from "@/lib/activeProject";
import { rpc } from "@/lib/rpc";
import { assertTxHash } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

interface TraceResult {
    structLogs: unknown[];
    callTrace: unknown;
    traceError: string | null;
    cached?: boolean;
}

function friendlyTraceError(message: string | undefined): string {
    if (!message) return "No trace data available for this transaction.";
    if (message.includes("not available") || message.includes("Fork Error") || message.includes("unsupported")) {
        return "Tracing unavailable: this RPC does not support debug_traceTransaction. Use a local chain or an RPC plan with debug methods.";
    }
    return message;
}

export async function GET(req: Request, { params }: { params: Promise<{ hash: string }> }) {
    return handleRoute(async (): Promise<TraceResult> => {
        const hash = assertTxHash((await params).hash);
        const { port } = resolveFromRequest(req);

        const cached = getTxTrace(hash);
        if (cached) return { ...cached, traceError: null, cached: true };

        // Either tracer can fail independently on a fork RPC — ask for both, keep what works.
        const [callRes, structRes] = await Promise.allSettled([
            rpc<unknown>("debug_traceTransaction", [hash, { tracer: "callTracer" }], port),
            rpc<{ structLogs?: unknown[] }>("debug_traceTransaction", [hash, {
                disableStorage: false,
                disableMemory: false,
                disableStack: false,
            }], port),
        ]);

        const callTrace = callRes.status === "fulfilled" ? callRes.value ?? null : null;
        const structLogs = structRes.status === "fulfilled" ? structRes.value?.structLogs ?? [] : [];

        if (!callTrace && structLogs.length === 0) {
            const reason = structRes.status === "rejected"
                ? (structRes.reason as Error)?.message
                : callRes.status === "rejected"
                    ? (callRes.reason as Error)?.message
                    : undefined;
            return { structLogs: [], callTrace: null, traceError: friendlyTraceError(reason) };
        }

        saveTxTrace(hash, structLogs, callTrace);
        return { structLogs, callTrace, traceError: null };
    });
}
