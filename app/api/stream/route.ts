import { resolveFromRequest } from "@/lib/activeProject";
import { insertBlocksAndTxs } from "@/lib/txStore";
import { rpc, rpcBatch } from "@/lib/rpc";
import {
    hexToNumber,
    toBlockRecord,
    toTxEvent,
    toTxRecord,
    type RpcBlock,
    type RpcReceipt,
} from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 500;
const HEARTBEAT_MS = 15_000;
/** Blocks indexed per tick — a fork or a long catch-up resumes on the next tick. */
const MAX_BLOCKS_PER_TICK = 200;

const encoder = new TextEncoder();

export async function GET(req: Request) {
    let closed = false;
    let lastBlock = -1;
    let lastKey = "";

    const stream = new ReadableStream({
        start(controller) {
            const write = (chunk: string) => {
                if (closed) return false;
                try {
                    controller.enqueue(encoder.encode(chunk));
                    return true;
                } catch {
                    closed = true;
                    return false;
                }
            };
            const send = (data: unknown) => write(`data: ${JSON.stringify(data)}\n\n`);

            const shutdown = () => {
                if (closed) return;
                closed = true;
                clearInterval(heartbeat);
                clearInterval(timer);
                try { controller.close(); } catch { /* already closed */ }
            };

            req.signal.addEventListener("abort", shutdown);

            const heartbeat = setInterval(() => {
                if (!write(": heartbeat\n\n")) shutdown();
            }, HEARTBEAT_MS);

            let ticking = false;
            const tick = async () => {
                if (closed || ticking) return; // never let two polls overlap
                ticking = true;
                try {
                    await pollOnce();
                } catch {
                    /* node unreachable — retry on the next tick */
                } finally {
                    ticking = false;
                }
            };

            const pollOnce = async () => {
                const active = resolveFromRequest(req);
                const { port, chainId, projectId } = active;

                // Restarting the node, switching chains, or switching projects invalidates
                // the cursor — reset instead of stalling forever on `current <= lastBlock`.
                const key = `${projectId ?? "-"}:${chainId}:${port}`;
                if (key !== lastKey) {
                    lastKey = key;
                    lastBlock = -1;
                    send({ type: "status", chainId, port, projectId });
                }

                const current = hexToNumber(await rpc<string>("eth_blockNumber", [], port), -1);
                if (current < 0) return;

                if (lastBlock === -1) {
                    // First tick on this node: start from the tip, don't replay history.
                    lastBlock = current;
                    send({ type: "status", chainId, port, projectId, blockNumber: current });
                    return;
                }
                if (current < lastBlock) {
                    // Chain reset (anvil_reset / restart) — resync from the new tip.
                    lastBlock = current;
                    send({ type: "reset", chainId, port, blockNumber: current });
                    return;
                }
                if (current === lastBlock) return;

                const from = lastBlock + 1;
                const to = Math.min(current, lastBlock + MAX_BLOCKS_PER_TICK);

                const numbers: number[] = [];
                for (let bn = from; bn <= to; bn++) numbers.push(bn);

                const blocks = await rpcBatch<RpcBlock>(
                    numbers.map((bn) => ({ method: "eth_getBlockByNumber", params: [`0x${bn.toString(16)}`, true] })),
                    port
                );

                const scope = { chainId, projectId };
                const blockRecords = [];
                const pending: { tx: NonNullable<RpcBlock["transactions"]>[number]; bn: number; ts: number }[] = [];

                for (let i = 0; i < numbers.length; i++) {
                    const block = blocks[i];
                    if (!block?.hash) continue;
                    const bn = numbers[i];
                    const record = toBlockRecord(block, bn, scope);
                    blockRecords.push(record);
                    for (const tx of block.transactions ?? []) {
                        pending.push({ tx, bn, ts: record.timestamp });
                    }
                }

                const receipts = await rpcBatch<RpcReceipt>(
                    pending.map((p) => ({ method: "eth_getTransactionReceipt", params: [p.tx.hash] })),
                    port
                );

                const txRecords = pending.map((p, i) => toTxRecord(p.tx, p.bn, p.ts, receipts[i] ?? null, scope));

                // One transaction for the whole batch — far cheaper than a write per row.
                insertBlocksAndTxs(blockRecords, txRecords);

                for (const block of blockRecords) {
                    send({
                        type: "block",
                        number: block.number,
                        hash: block.hash,
                        txCount: block.tx_count,
                        timestamp: block.timestamp,
                        gasUsed: block.gas_used,
                    });
                }
                for (const record of txRecords) send(toTxEvent(record));

                lastBlock = to;
            };

            const timer = setInterval(tick, POLL_MS);
            void tick();
        },
        cancel() {
            closed = true;
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
