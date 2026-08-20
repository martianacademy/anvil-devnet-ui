import { getDB, scopeId } from "@/lib/db";
import { deployAt, erc20CreationBytecode, installCode } from "@/lib/codePatcher";
import { fetchTokenMetadata } from "@/lib/tokenBalances";
import { resolveFromRequest } from "@/lib/activeProject";
import { rpc } from "@/lib/rpc";
import { ValidationError, assertAddress, assertAmount, assertHex, assertInt, assertNonEmptyString } from "@/lib/validate";
import { handleRoute } from "@/lib/route";
import { parseUnits } from "viem";

export const dynamic = "force-dynamic";

/** Bytecode above this is rejected before it reaches the node — it is a paste field. */
const MAX_BYTECODE_CHARS = 100_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function assertBytecode(value: unknown, field: string): `0x${string}` {
    const hex = assertHex(value, field);
    if (hex.length > MAX_BYTECODE_CHARS) {
        throw new ValidationError(`${field} is too large (max ${MAX_BYTECODE_CHARS / 2} bytes)`);
    }
    if (hex.length % 2 !== 0) throw new ValidationError(`${field} must have an even number of hex digits`);
    return hex;
}

/**
 * Put contract code at any address.
 *
 * - `erc20`    — the built-in token, with the name/symbol/decimals/supply you give it
 * - `creation` — your own constructor bytecode, run in a simulation so its storage lands too
 * - `runtime`  — raw runtime bytecode written verbatim, no constructor, no storage
 */
export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json();
        const active = resolveFromRequest(req);
        const address = assertAddress(body.address, "address");
        const mode = body.mode ?? "erc20";

        let result;
        if (mode === "erc20") {
            const decimals = assertInt(body.decimals ?? 18, "decimals", 0, 36);
            const holder = body.holder ? assertAddress(body.holder, "holder") : ZERO_ADDRESS;
            const supply = assertAmount(body.totalSupply ?? "0", "totalSupply");
            result = await deployAt(address, erc20CreationBytecode({
                name: assertNonEmptyString(body.name, "name", 64),
                symbol: assertNonEmptyString(body.symbol, "symbol", 32),
                decimals,
                totalSupply: parseUnits(supply, decimals),
                holder,
            }), active.port);
        } else if (mode === "creation") {
            const bytecode = assertBytecode(body.bytecode, "bytecode");
            // Constructor arguments are ABI-encoded by the caller and simply appended.
            const args = body.constructorArgs ? assertBytecode(body.constructorArgs, "constructorArgs").slice(2) : "";
            result = await deployAt(address, `${bytecode}${args}`, active.port);
        } else if (mode === "runtime") {
            result = await installCode(address, assertBytecode(body.bytecode, "bytecode"), {}, active.port);
        } else {
            throw new ValidationError(`Unknown mode: ${mode} (expected erc20, creation or runtime)`);
        }

        getDB().prepare(`
      INSERT INTO patch_history (type, target_address, payload, applied_at, project_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
            "set_code",
            address,
            // The bytecode itself would bloat the history table; the shape of the patch is what matters.
            JSON.stringify({ mode, codeSize: result.codeSize, slotsWritten: result.slotsWritten }),
            Date.now(),
            scopeId(active.projectId)
        );

        return { success: true, ...result };
    });
}

/** What is at this address right now — used to warn before overwriting a live contract. */
export async function GET(req: Request) {
    return handleRoute(async () => {
        const address = assertAddress(new URL(req.url).searchParams.get("address"));
        const active = resolveFromRequest(req);

        const code = await rpc<string>("eth_getCode", [address, "latest"], active.port).catch(() => "0x");
        const hasCode = code !== "0x" && code !== "0x0";
        return {
            address,
            hasCode,
            codeSize: hasCode ? code.length / 2 - 1 : 0,
            token: hasCode ? await fetchTokenMetadata(address, active.port) : null,
        };
    });
}
