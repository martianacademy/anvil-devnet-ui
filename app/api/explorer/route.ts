import { type NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getAnvilState } from "@/lib/anvilProcess";

export const dynamic = "force-dynamic";

interface ContractRow { abi: string; name?: string; source?: string }
interface BlockRow { number: number }

const ok = (result: unknown) =>
    NextResponse.json({ status: "1", message: "OK", result });
const err = (msg: string) =>
    NextResponse.json({ status: "0", message: "NOTOK", result: msg });

/** Current active chainId — used to scope all DB queries */
function getChainId() {
    return getAnvilState().config?.chainId ?? 31337;
}

async function rpcCall(method: string, params: unknown[] = []) {
    const port = getAnvilState().config?.port ?? 8545;
    const res = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
}

export async function GET(req: NextRequest) {
    const p = req.nextUrl.searchParams;
    const module = p.get("module");
    const action = p.get("action");
    const db = getDB();

    try {
        const chainId = getChainId();

        // ── module=account ──────────────────────────────────────────────────────
        if (module === "account") {
            if (action === "balance") {
                const address = p.get("address") ?? "";
                const bal = await rpcCall("eth_getBalance", [address, "latest"]);
                return ok(BigInt(bal).toString());
            }

            if (action === "balancemulti") {
                const addresses = (p.get("address") ?? "").split(",").slice(0, 20);
                const results = await Promise.all(
                    addresses.map(async (a) => {
                        const bal = await rpcCall("eth_getBalance", [a.trim(), "latest"]);
                        return { account: a.trim(), balance: BigInt(bal).toString() };
                    })
                );
                return ok(results);
            }

            if (action === "txlist") {
                const address = (p.get("address") ?? "").toLowerCase();
                const start = parseInt(p.get("startblock") ?? "0");
                const end = parseInt(p.get("endblock") ?? "999999999");
                const sort = p.get("sort") === "desc" ? "DESC" : "ASC";
                const page = parseInt(p.get("page") ?? "1");
                const offset = parseInt(p.get("offset") ?? "10000");
                const limit = Math.min(offset, 10000);
                const skip = (page - 1) * limit;
                const rows = db.prepare(`
          SELECT * FROM transactions
          WHERE (lower(from_address) = ? OR lower(to_address) = ?)
            AND chain_id = ?
            AND block_number BETWEEN ? AND ?
          ORDER BY block_number ${sort}
          LIMIT ? OFFSET ?
        `).all(address, address, chainId, start, end, limit, skip);
                return ok(rows);
            }

            if (action === "txlistinternal") {
                // Returns internal txs from call trace
                const address = (p.get("address") ?? "").toLowerCase();
                return ok([]); // TODO: parse from tx_traces
            }

            if (action === "tokentx") {
                const address = (p.get("address") ?? "").toLowerCase();
                const contract = p.get("contractaddress") ?? "";
                const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
                const filter: Record<string, unknown> = {
                    topics: [TRANSFER_TOPIC, null, `0x000000000000000000000000${address.slice(2)}`],
                    fromBlock: "0x0",
                    toBlock: "latest",
                };
                if (contract) filter.address = contract;
                const logs = await rpcCall("eth_getLogs", [filter]);
                return ok(logs);
            }

            if (action === "tokenbalance") {
                const token = p.get("contractaddress") ?? "";
                const wallet = p.get("address") ?? "";
                const selector = "0x70a08231";
                const paddedAddr = wallet.toLowerCase().replace("0x", "").padStart(64, "0");
                const callData = selector + paddedAddr;
                const result = await rpcCall("eth_call", [{ to: token, data: callData }, "latest"]);
                return ok(BigInt(result).toString());
            }

            if (action === "listaccounts") {
                const rawAccounts: string[] = await rpcCall("eth_accounts", []);
                const accounts = await Promise.all(
                    rawAccounts.map(async (address) => {
                        const [balHex, nonceHex] = await Promise.all([
                            rpcCall("eth_getBalance", [address, "latest"]),
                            rpcCall("eth_getTransactionCount", [address, "latest"]),
                        ]);
                        return {
                            address,
                            balance: BigInt(balHex).toString(),
                            nonce: parseInt(nonceHex, 16),
                        };
                    })
                );
                return ok(accounts);
            }
        }

        // ── module=contract ──────────────────────────────────────────────────────
        if (module === "contract") {
            if (action === "getabi") {
                const address = (p.get("address") ?? "").toLowerCase();
                const row = db.prepare("SELECT abi FROM contracts WHERE lower(address)=?").get(address) as ContractRow | undefined;
                if (!row) return err("Contract source code not verified.");
                return ok(row.abi);
            }

            if (action === "getsourcecode") {
                const address = (p.get("address") ?? "").toLowerCase();
                const row = db.prepare("SELECT * FROM contracts WHERE lower(address)=?").get(address) as ContractRow | undefined;
                if (!row) return ok([{ SourceCode: "", ABI: "Contract source code not verified.", ContractName: "", CompilerVersion: "", OptimizationUsed: "0" }]);
                return ok([{
                    SourceCode: row.source ?? "",
                    ABI: row.abi,
                    ContractName: row.name,
                    CompilerVersion: "N/A",
                    OptimizationUsed: "1",
                }]);
            }
        }

        // ── module=transaction ────────────────────────────────────────────────────
        if (module === "transaction") {
            const hash = p.get("txhash") ?? "";
            const receipt = await rpcCall("eth_getTransactionReceipt", [hash]);
            if (!receipt) return err("Transaction not found");
            const success = parseInt(receipt.status ?? "0x1", 16) === 1;
            if (action === "gettxreceiptstatus") return ok({ status: success ? "1" : "0" });
            if (action === "getstatus") return ok({ isError: success ? "0" : "1", errDescription: "" });
        }

        // ── module=block ──────────────────────────────────────────────────────────
        // ── module=tx ──────────────────────────────────────────────────────────
        if (module === "tx" && action === "getrecentlist") {
            const limit = Math.min(parseInt(p.get("limit") ?? "100"), 500);
            const rows = db.prepare(
                "SELECT * FROM transactions WHERE chain_id = ? ORDER BY block_number DESC, nonce DESC LIMIT ?"
            ).all(chainId, limit);
            return ok(rows);
        }

        if (module === "block" && action === "getblocklist") {
            const page = parseInt(p.get("page") ?? "1");
            const offset = parseInt(p.get("offset") ?? "10");
            const limit = Math.min(offset, 100);
            const skip = (page - 1) * limit;
            const rows = db.prepare(
                "SELECT number, hash, timestamp, tx_count AS txCount, gas_used AS gasUsed FROM blocks WHERE chain_id = ? ORDER BY number DESC LIMIT ? OFFSET ?"
            ).all(chainId, limit, skip);
            return ok(rows);
        }

        if (module === "block" && action === "getblocknobytime") {
            const ts = parseInt(p.get("timestamp") ?? "0");
            const closest = p.get("closest") ?? "before";
            const op = closest === "before" ? "<=" : ">=";
            const row = db.prepare(`SELECT number FROM blocks WHERE chain_id = ? AND timestamp ${op} ? ORDER BY timestamp DESC LIMIT 1`).get(chainId, ts) as BlockRow | undefined;
            return row ? ok(row.number.toString()) : err("No block found");
        }

        // ── module=logs ───────────────────────────────────────────────────────────
        if (module === "logs" && action === "getLogs") {
            const address = p.get("address");
            const topic0 = p.get("topic0");
            const topic1 = p.get("topic1");
            const fromBlock = p.get("fromBlock") ?? "0x0";
            const toBlock = p.get("toBlock") ?? "latest";
            const filter: Record<string, unknown> = {
                fromBlock,
                toBlock,
                topics: [topic0 ?? null, topic1 ?? null],
            };
            if (address) filter.address = address;
            const logs = await rpcCall("eth_getLogs", [filter]);
            return ok(logs);
        }

        // ── module=proxy ──────────────────────────────────────────────────────────
        if (module === "proxy") {
            const method = action as string;
            const params: unknown[] = [];
            if (p.has("txhash")) params.push(p.get("txhash"));
            if (p.has("address")) params.push(p.get("address"));
            if (p.has("tag")) params.push(p.get("tag"));
            if (p.has("boolean")) params.push(p.get("boolean") === "true");
            const result = await rpcCall(method, params);
            return ok(result);
        }
    } catch (e: unknown) {
        return err(e instanceof Error ? e.message : "Unknown error");
    }

    return err(`Unknown module/action: ${module}/${action}`);
}
