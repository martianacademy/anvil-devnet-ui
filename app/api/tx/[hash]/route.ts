import { NextResponse } from "next/server";
import { getTxByHash } from "@/lib/txStore";
import { getAnvilState } from "@/lib/anvilProcess";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ hash: string }> }
) {
    try {
        const { hash } = await params;

        // Check SQLite first — normalize to flat camelCase shape
        const cached = getTxByHash(hash);
        if (cached) {
            return NextResponse.json({
                hash: cached.hash,
                from: cached.from_address,
                to: cached.to_address ?? null,
                blockNumber: cached.block_number,
                gas: cached.gas,
                gasUsed: cached.gas_used,
                value: cached.value,
                input: cached.input,
                nonce: cached.nonce,
                status: cached.status === 1 ? "success" : "failed",
                decoded_function: cached.decoded_function,
                receipt: null,
            });
        }

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

        const t = txRes.result;
        const r = rcptRes.result;
        if (!t) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

        return NextResponse.json({
            hash: t.hash,
            from: t.from,
            to: t.to ?? null,
            blockNumber: t.blockNumber ? parseInt(t.blockNumber, 16) : null,
            gas: t.gas,
            gasUsed: r?.gasUsed ?? null,
            value: t.value,
            input: t.input,
            nonce: t.nonce ? parseInt(t.nonce, 16) : null,
            status: r ? (parseInt(r.status, 16) === 1 ? "success" : "failed") : "unknown",
            decoded_function: null,
            receipt: r ?? null,
        });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
