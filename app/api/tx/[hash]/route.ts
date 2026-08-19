import { getTxByHash } from "@/lib/txStore";
import { resolveFromRequest } from "@/lib/activeProject";
import { rpc } from "@/lib/rpc";
import { getName } from "@/lib/abiRegistry";
import { hexToNumber, type RpcReceipt, type RpcTx } from "@/lib/indexer";
import { HttpError, assertTxHash } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ hash: string }> }) {
    return handleRoute(async () => {
        const hash = assertTxHash((await params).hash);
        const { port } = resolveFromRequest(req);

        // Indexed copy first; fall back to the live node for anything not yet streamed.
        const cached = getTxByHash(hash);
        if (cached) {
            return {
                hash: cached.hash,
                from: cached.from_address,
                to: cached.to_address,
                blockNumber: cached.block_number,
                blockTimestamp: cached.block_timestamp,
                gas: cached.gas,
                gasUsed: cached.gas_used,
                gasPrice: cached.gas_price,
                value: cached.value,
                input: cached.input,
                nonce: cached.nonce,
                status: cached.status === 1 ? "success" : "failed",
                decoded_function: cached.decoded_function,
                decoded_params: cached.decoded_params ? JSON.parse(cached.decoded_params) : null,
                contractName: cached.to_address ? getName(cached.to_address) : null,
                source: "index" as const,
                receipt: null,
            };
        }

        const [tx, receipt] = await Promise.all([
            rpc<RpcTx & { blockNumber?: string } | null>("eth_getTransactionByHash", [hash], port),
            rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash], port),
        ]);
        if (!tx) throw new HttpError(404, "Transaction not found");

        return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to ?? null,
            blockNumber: tx.blockNumber ? hexToNumber(tx.blockNumber) : null,
            blockTimestamp: null,
            gas: tx.gas ?? null,
            gasUsed: receipt?.gasUsed ?? null,
            gasPrice: tx.gasPrice ?? null,
            value: tx.value ?? "0x0",
            input: tx.input ?? null,
            nonce: tx.nonce ? hexToNumber(tx.nonce) : null,
            status: receipt ? (hexToNumber(receipt.status, 1) === 1 ? "success" : "failed") : "pending",
            decoded_function: null,
            decoded_params: null,
            contractName: tx.to ? getName(tx.to) : null,
            source: "node" as const,
            receipt: receipt ?? null,
        };
    });
}
