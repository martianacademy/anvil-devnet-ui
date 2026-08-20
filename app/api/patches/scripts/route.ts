import { getDB, scopeId } from "@/lib/db";
import { fundNative, writeStorageSlot } from "@/lib/patcher";
import { setTokenBalance } from "@/lib/tokenBalances";
import { resolveFromRequest } from "@/lib/activeProject";
import { ValidationError, assertAddress, assertAmount, assertHex, assertInt, assertNonEmptyString, assertSlot,  } from "@/lib/validate";
import { handleRoute } from "@/lib/route";
import { parseUnits } from "viem";

export const dynamic = "force-dynamic";

interface ScriptRow { id: number; name: string; ops: string; created_at: number }

export interface ScriptOp {
    type: "fund_native" | "fund_erc20" | "storage_write";
    address?: string;
    contract?: string;
    token?: string;
    amount?: string;
    decimals?: number;
    slot?: string;
    value?: string;
}

/** Validate one op up-front so a script never half-applies on bad input. */
function validateOp(op: ScriptOp, index: number): ScriptOp {
    const where = `ops[${index}]`;
    switch (op.type) {
        case "fund_native":
            return { type: op.type, address: assertAddress(op.address, `${where}.address`), amount: assertAmount(op.amount, `${where}.amount`) };
        case "fund_erc20":
            return {
                type: op.type,
                address: assertAddress(op.address, `${where}.address`),
                token: assertAddress(op.token, `${where}.token`),
                amount: assertAmount(op.amount, `${where}.amount`),
                decimals: assertInt(op.decimals ?? 18, `${where}.decimals`, 0, 36),
            };
        case "storage_write":
            return {
                type: op.type,
                contract: assertAddress(op.contract, `${where}.contract`),
                slot: assertSlot(op.slot, `${where}.slot`),
                value: assertHex(op.value, `${where}.value`),
            };
        default:
            throw new ValidationError(`${where}.type must be fund_native, fund_erc20 or storage_write`);
    }
}

export async function GET() {
    return handleRoute(async () => {
        const scripts = getDB().prepare("SELECT * FROM patch_scripts ORDER BY created_at DESC").all() as ScriptRow[];
        return scripts.map((s) => ({ ...s, ops: JSON.parse(s.ops) as ScriptOp[] }));
    });
}

export async function POST(req: Request) {
    return handleRoute(async () => {
        const { action, name, ops, id: scriptId } = await req.json();
        const db = getDB();
        const active = resolveFromRequest(req);

        if (action === "save") {
            const scriptName = assertNonEmptyString(name, "name", 60);
            if (!Array.isArray(ops) || ops.length === 0) throw new ValidationError("ops must be a non-empty array");
            const validated = ops.map((op: ScriptOp, i: number) => validateOp(op, i));
            db.prepare("INSERT OR REPLACE INTO patch_scripts (name, ops, created_at) VALUES (?, ?, ?)")
                .run(scriptName, JSON.stringify(validated), Date.now());
            return { success: true, name: scriptName, ops: validated.length };
        }

        if (action === "run") {
            const id = assertInt(scriptId, "id", 1, Number.MAX_SAFE_INTEGER);
            const row = db.prepare("SELECT * FROM patch_scripts WHERE id = ?").get(id) as ScriptRow | undefined;
            if (!row) throw new ValidationError("Script not found");

            const scriptOps = (JSON.parse(row.ops) as ScriptOp[]).map(validateOp);
            const history = db.prepare(
                "INSERT INTO patch_history (type, target_address, payload, applied_at, project_id) VALUES (?, ?, ?, ?, ?)"
            );

            for (const op of scriptOps) {
                if (op.type === "fund_native") {
                    await fundNative(op.address!, op.amount!, active.port);
                } else if (op.type === "fund_erc20") {
                    await setTokenBalance(op.token!, op.address!, parseUnits(op.amount!, op.decimals ?? 18), active.port, undefined, op.decimals ?? 18);
                } else {
                    await writeStorageSlot(op.contract!, op.slot!, op.value!, active.port);
                }
                history.run(op.type, op.address ?? op.contract ?? "", JSON.stringify(op), Date.now(), scopeId(active.projectId));
            }

            return { success: true, ran: scriptOps.length };
        }

        if (action === "delete") {
            const id = assertInt(scriptId, "id", 1, Number.MAX_SAFE_INTEGER);
            db.prepare("DELETE FROM patch_scripts WHERE id = ?").run(id);
            return { success: true };
        }

        throw new ValidationError(`Unknown action: ${action}`);
    });
}
