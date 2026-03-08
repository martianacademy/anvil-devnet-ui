import { NextResponse } from "next/server";
import { getTxByHash } from "@/lib/txStore";
import { getAnvilState } from "@/lib/anvilProcess";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ hash: string }> }
) {
    try {
        const { hash } = await params;

        // Check SQLite first
        const cached = getTxByHash(hash);
        if (cached) return NextResponse.json(cached);

        // Fetch live from anvil
        const port = getAnvilState().config?.port ?? 8545;
        const jsonRpc = (method: string, p: unknown[]) =>
            fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method, params: p, id: Date.now() }),
            }).then((r) => r.json());

        const [txRes, rcptRes] = await Promise.all([
            jsonRpc("eth_getTransactionByHash", [hash]),
            jsonRpc("eth_getTransactionReceipt", [hash]),
        ]);

        return NextResponse.json({
            tx: txRes.result,
            receipt: rcptRes.result,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
