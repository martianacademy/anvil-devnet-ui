import { type NextRequest, NextResponse } from "next/server";
import { getDB, scopeId } from "@/lib/db";
import { resolveFromRequest } from "@/lib/activeProject";
import { rpc, rpcBatch } from "@/lib/rpc";
import { clampInt } from "@/lib/validate";

export const dynamic = "force-dynamic";

interface ContractRow { abi: string; name?: string; source?: string }
interface BlockRow { number: number }

const ok = (result: unknown, extra: Record<string, unknown> = {}) =>
    NextResponse.json({ status: "1", message: "OK", result, ...extra });
const fail = (msg: string) =>
    NextResponse.json({ status: "0", message: "NOTOK", result: msg });

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function padAddress(address: string): string {
    return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

/**
 * BscScan/Etherscan-compatible read API over the indexed SQLite data and the live node.
 * Scoped to the active project + chain so multiple devnets never bleed into each other.
 */
export async function GET(req: NextRequest) {
    const p = req.nextUrl.searchParams;
    const mod = p.get("module");
    const action = p.get("action");
    const db = getDB();
    const active = resolveFromRequest(req);
    const { chainId, port } = active;
    const project = scopeId(active.projectId);

    try {
        // ── module=account ──────────────────────────────────────────────────────
        if (mod === "account") {
            if (action === "balance") {
                const address = p.get("address") ?? "";
                return ok(BigInt(await rpc<string>("eth_getBalance", [address, "latest"], port)).toString());
            }

            if (action === "balancemulti") {
                const addresses = (p.get("address") ?? "").split(",").map((a) => a.trim()).filter(Boolean).slice(0, 20);
                const results = await rpcBatch<string>(
                    addresses.map((a) => ({ method: "eth_getBalance", params: [a, "latest"] })),
                    port
                );
                return ok(addresses.map((account, i) => ({
                    account,
                    balance: results[i] ? BigInt(results[i]).toString() : "0",
                })));
            }

            if (action === "txlist") {
                const address = (p.get("address") ?? "").toLowerCase();
                const start = clampInt(p.get("startblock"), 0, 0, Number.MAX_SAFE_INTEGER);
                const end = clampInt(p.get("endblock"), 999_999_999, 0, Number.MAX_SAFE_INTEGER);
                const sort = p.get("sort") === "desc" ? "DESC" : "ASC";
                const page = clampInt(p.get("page"), 1, 1, 100_000);
                const limit = clampInt(p.get("offset"), 1000, 1, 10_000);
                const rows = db.prepare(`
          SELECT * FROM transactions
          WHERE (lower(from_address) = ? OR lower(to_address) = ?)
            AND chain_id = ? AND project_id = ?
            AND block_number BETWEEN ? AND ?
          ORDER BY block_number ${sort}
          LIMIT ? OFFSET ?
        `).all(address, address, chainId, project, start, end, limit, (page - 1) * limit);
                return ok(rows);
            }

            if (action === "txlistinternal") {
                const address = (p.get("address") ?? "").toLowerCase();
                return ok(internalTransfersFor(address, chainId, project));
            }

            if (action === "tokentx") {
                const address = (p.get("address") ?? "").toLowerCase();
                const contract = p.get("contractaddress") ?? "";
                const padded = address ? padAddress(address) : null;
                const base = { fromBlock: "0x0", toBlock: "latest", ...(contract ? { address: contract } : {}) };

                // A transfer touching the address is either the `from` or the `to` topic.
                const [sent, received] = await Promise.all([
                    rpc<unknown[]>("eth_getLogs", [{ ...base, topics: [TRANSFER_TOPIC, padded, null] }], port),
                    rpc<unknown[]>("eth_getLogs", [{ ...base, topics: [TRANSFER_TOPIC, null, padded] }], port),
                ]);
                return ok([...(sent ?? []), ...(received ?? [])]);
            }

            if (action === "tokenbalance") {
                const token = p.get("contractaddress") ?? "";
                const wallet = p.get("address") ?? "";
                const data = `0x70a08231${wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
                const result = await rpc<string>("eth_call", [{ to: token, data }, "latest"], port);
                return ok(result && result !== "0x" ? BigInt(result).toString() : "0");
            }

            if (action === "listaccounts") {
                const addresses = await rpc<string[]>("eth_accounts", [], port);
                const calls = addresses.flatMap((address) => [
                    { method: "eth_getBalance", params: [address, "latest"] },
                    { method: "eth_getTransactionCount", params: [address, "latest"] },
                ]);
                const results = await rpcBatch<string>(calls, port);
                return ok(addresses.map((address, i) => ({
                    address,
                    balance: results[i * 2] ? BigInt(results[i * 2] as string).toString() : "0",
                    nonce: results[i * 2 + 1] ? parseInt(results[i * 2 + 1] as string, 16) : 0,
                })));
            }
        }

        // ── module=contract ─────────────────────────────────────────────────────
        if (mod === "contract") {
            const address = (p.get("address") ?? "").toLowerCase();

            if (action === "getabi") {
                const row = db.prepare("SELECT abi FROM contracts WHERE lower(address)=?").get(address) as ContractRow | undefined;
                if (!row) return fail("Contract source code not verified.");
                return ok(row.abi);
            }

            if (action === "getsourcecode") {
                const row = db.prepare("SELECT * FROM contracts WHERE lower(address)=?").get(address) as ContractRow | undefined;
                if (!row) {
                    return ok([{ SourceCode: "", ABI: "Contract source code not verified.", ContractName: "", CompilerVersion: "", OptimizationUsed: "0" }]);
                }
                return ok([{
                    SourceCode: row.source ?? "",
                    ABI: row.abi,
                    ContractName: row.name,
                    CompilerVersion: "N/A",
                    OptimizationUsed: "1",
                }]);
            }
        }

        // ── module=transaction ──────────────────────────────────────────────────
        if (mod === "transaction") {
            const hash = p.get("txhash") ?? "";
            const receipt = await rpc<{ status?: string } | null>("eth_getTransactionReceipt", [hash], port);
            if (!receipt) return fail("Transaction not found");
            const success = parseInt(receipt.status ?? "0x1", 16) === 1;
            if (action === "gettxreceiptstatus") return ok({ status: success ? "1" : "0" });
            if (action === "getstatus") return ok({ isError: success ? "0" : "1", errDescription: "" });
        }

        // ── module=tx ───────────────────────────────────────────────────────────
        if (mod === "tx" && action === "getrecentlist") {
            const limit = clampInt(p.get("limit"), 100, 1, 1000);
            const offset = clampInt(p.get("offset"), 0, 0, 1_000_000);
            const rows = db.prepare(`
                SELECT * FROM transactions
                 WHERE chain_id = ? AND project_id = ?
                 ORDER BY block_number DESC, nonce DESC
                 LIMIT ? OFFSET ?
            `).all(chainId, project, limit, offset);
            const total = (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE chain_id = ? AND project_id = ?")
                .get(chainId, project) as { n: number }).n;
            return ok(rows, { total });
        }

        // ── module=block ────────────────────────────────────────────────────────
        if (mod === "block" && action === "getblocklist") {
            const page = clampInt(p.get("page"), 1, 1, 100_000);
            const limit = clampInt(p.get("offset"), 10, 1, 200);
            const rows = db.prepare(`
                SELECT number, hash, timestamp, tx_count AS txCount, gas_used AS gasUsed, gas_limit AS gasLimit
                  FROM blocks
                 WHERE chain_id = ? AND project_id = ?
                 ORDER BY number DESC
                 LIMIT ? OFFSET ?
            `).all(chainId, project, limit, (page - 1) * limit);
            const total = (db.prepare("SELECT COUNT(*) AS n FROM blocks WHERE chain_id = ? AND project_id = ?")
                .get(chainId, project) as { n: number }).n;
            return ok(rows, { total });
        }

        if (mod === "block" && action === "getblocknobytime") {
            const ts = clampInt(p.get("timestamp"), 0, 0, Number.MAX_SAFE_INTEGER);
            const before = (p.get("closest") ?? "before") === "before";
            const row = db.prepare(`
                SELECT number FROM blocks
                 WHERE chain_id = ? AND project_id = ? AND timestamp ${before ? "<=" : ">="} ?
                 ORDER BY timestamp ${before ? "DESC" : "ASC"}
                 LIMIT 1
            `).get(chainId, project, ts) as BlockRow | undefined;
            return row ? ok(row.number.toString()) : fail("No block found");
        }

        // ── module=logs ─────────────────────────────────────────────────────────
        if (mod === "logs" && action === "getLogs") {
            const filter: Record<string, unknown> = {
                fromBlock: p.get("fromBlock") ?? "0x0",
                toBlock: p.get("toBlock") ?? "latest",
                topics: [p.get("topic0"), p.get("topic1"), p.get("topic2")].map((t) => t ?? null),
            };
            const address = p.get("address");
            if (address) filter.address = address;
            return ok(await rpc("eth_getLogs", [filter], port));
        }

        // ── module=proxy ────────────────────────────────────────────────────────
        if (mod === "proxy" && action) {
            const params: unknown[] = [];
            if (p.has("txhash")) params.push(p.get("txhash"));
            if (p.has("address")) params.push(p.get("address"));
            if (p.has("tag")) params.push(p.get("tag"));
            if (p.has("boolean")) params.push(p.get("boolean") === "true");
            return ok(await rpc(action, params, port));
        }
    } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : "Unknown error");
    }

    return fail(`Unknown module/action: ${mod}/${action}`);
}

interface CallNodeLike {
    type?: string;
    from?: string;
    to?: string;
    value?: string;
    gasUsed?: string;
    calls?: CallNodeLike[];
}

/** Derive Etherscan-style "internal transactions" from cached callTracer output. */
function internalTransfersFor(address: string, chainId: number, project: string) {
    if (!address) return [];
    const db = getDB();
    const rows = db.prepare(`
        SELECT t.hash, t.block_number, t.block_timestamp, tr.call_trace
          FROM tx_traces tr
          JOIN transactions t ON lower(t.hash) = lower(tr.hash)
         WHERE t.chain_id = ? AND t.project_id = ?
         ORDER BY t.block_number DESC
         LIMIT 500
    `).all(chainId, project) as { hash: string; block_number: number; block_timestamp: number; call_trace: string }[];

    const out: Record<string, unknown>[] = [];
    for (const row of rows) {
        let root: CallNodeLike | null;
        try {
            root = JSON.parse(row.call_trace);
        } catch {
            continue;
        }
        if (!root) continue;

        const walk = (node: CallNodeLike, depth: number) => {
            const from = node.from?.toLowerCase();
            const to = node.to?.toLowerCase();
            if (depth > 0 && (from === address || to === address)) {
                out.push({
                    hash: row.hash,
                    blockNumber: row.block_number,
                    timeStamp: row.block_timestamp,
                    from: node.from ?? null,
                    to: node.to ?? null,
                    value: node.value ? BigInt(node.value).toString() : "0",
                    gasUsed: node.gasUsed ?? null,
                    type: node.type ?? "CALL",
                    traceId: `${depth}`,
                });
            }
            for (const child of node.calls ?? []) walk(child, depth + 1);
        };
        walk(root, 0);
    }
    return out;
}
