import { getAnvilState } from "@/lib/anvilProcess";
import { insertBlock, insertTx } from "@/lib/txStore";
import { decodeInput, getName } from "@/lib/abiRegistry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
    const encoder = new TextEncoder();
    let lastBlock = -1;
    let closed = false;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: unknown) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch { /* stream closed */ }
            };

            // Heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
                if (closed) { clearInterval(heartbeat); return; }
                try {
                    controller.enqueue(encoder.encode(": heartbeat\n\n"));
                } catch { clearInterval(heartbeat); }
            }, 15000);

            const poll = setInterval(async () => {
                if (closed) { clearInterval(poll); clearInterval(heartbeat); return; }

                const port = getAnvilState().config?.port ?? 8545;

                try {
                    const res = await fetch(`http://127.0.0.1:${port}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
                    });
                    const data = await res.json();
                    const currentBlock = parseInt(data.result ?? "0x0", 16);

                    if (currentBlock <= lastBlock) return;

                    const from = lastBlock === -1 ? currentBlock : lastBlock + 1;

                    for (let bn = from; bn <= currentBlock; bn++) {
                        const blockRes = await fetch(`http://127.0.0.1:${port}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                jsonrpc: "2.0",
                                method: "eth_getBlockByNumber",
                                params: [`0x${bn.toString(16)}`, true],
                                id: 1,
                            }),
                        });
                        const blockData = await blockRes.json();
                        const block = blockData.result;
                        if (!block) continue;

                        const blockRecord = {
                            number: bn,
                            hash: block.hash,
                            timestamp: parseInt(block.timestamp, 16),
                            tx_count: block.transactions?.length ?? 0,
                            gas_used: block.gasUsed,
                            gas_limit: block.gasLimit,
                        };
                        insertBlock(blockRecord);

                        send({ type: "block", number: bn, hash: block.hash, txCount: blockRecord.tx_count, timestamp: blockRecord.timestamp });

                        for (const tx of (block.transactions ?? [])) {
                            // Get receipt
                            const rcptRes = await fetch(`http://127.0.0.1:${port}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    jsonrpc: "2.0",
                                    method: "eth_getTransactionReceipt",
                                    params: [tx.hash],
                                    id: 1,
                                }),
                            });
                            const rcptData = await rcptRes.json();
                            const receipt = rcptData.result;

                            let decodedFn: string | null = null;
                            if (tx.to && tx.input && tx.input !== "0x") {
                                const decoded = decodeInput(tx.to, tx.input);
                                if (decoded) decodedFn = decoded.functionName;
                            }

                            const txRecord = {
                                hash: tx.hash,
                                block_number: bn,
                                block_timestamp: blockRecord.timestamp,
                                from_address: tx.from,
                                to_address: tx.to ?? null,
                                value: tx.value ?? "0x0",
                                input: tx.input ?? null,
                                gas: tx.gas ?? null,
                                gas_used: receipt?.gasUsed ?? null,
                                gas_price: tx.gasPrice ?? null,
                                nonce: parseInt(tx.nonce ?? "0", 16),
                                status: receipt ? parseInt(receipt.status ?? "0x1", 16) : 1,
                                revert_reason: null,
                                decoded_function: decodedFn,
                                decoded_params: null,
                            };
                            insertTx(txRecord);

                            send({
                                type: "tx",
                                hash: tx.hash,
                                from: tx.from,
                                to: tx.to,
                                value: tx.value ?? "0x0",
                                gasUsed: receipt?.gasUsed ?? "0x0",
                                status: txRecord.status === 1 ? "success" : "failed",
                                blockNumber: bn,
                                decodedFunction: decodedFn,
                                contractName: tx.to ? getName(tx.to) : null,
                            });
                        }
                    }

                    lastBlock = currentBlock;
                } catch { /* anvil not ready */ }
            }, 500);
        },
        cancel() {
            closed = true;
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
