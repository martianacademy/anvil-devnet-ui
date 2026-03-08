import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { fundNative } from "@/lib/patcher";
import { setTokenBalance } from "@/lib/tokenBalances";
import { writeStorageSlot } from "@/lib/patcher";
import { getAnvilState } from "@/lib/anvilProcess";

export async function GET() {
    const db = getDB();
    const scripts = db.prepare("SELECT * FROM patch_scripts ORDER BY created_at DESC").all() as any[];
    return NextResponse.json(scripts.map((s) => ({ ...s, ops: JSON.parse(s.ops) })));
}

export async function POST(req: Request) {
    try {
        const { action, name, ops, id: scriptId } = await req.json();
        const db = getDB();

        if (action === "save") {
            db.prepare(`
        INSERT OR REPLACE INTO patch_scripts (name, ops, created_at) VALUES (?, ?, ?)
      `).run(name, JSON.stringify(ops), Date.now());
            return NextResponse.json({ success: true });
        }

        if (action === "run") {
            const row = db.prepare("SELECT * FROM patch_scripts WHERE id = ?").get(scriptId) as any;
            if (!row) return NextResponse.json({ error: "Script not found" }, { status: 404 });
            const scriptOps = JSON.parse(row.ops) as any[];
            const port = getAnvilState().config?.port ?? 8545;

            for (const op of scriptOps) {
                if (op.type === "fund_native") {
                    await fundNative(op.address, op.amount, port);
                } else if (op.type === "fund_erc20") {
                    const amountBig = BigInt(Math.floor(parseFloat(op.amount) * 10 ** (op.decimals ?? 18)));
                    await setTokenBalance(op.token, op.address, amountBig, port);
                } else if (op.type === "storage_write") {
                    await writeStorageSlot(op.contract, op.slot, op.value, port);
                }
                db.prepare(`INSERT INTO patch_history (type, target_address, payload, applied_at) VALUES (?, ?, ?, ?)`)
                    .run(op.type, op.address ?? op.contract, JSON.stringify(op), Date.now());
            }
            return NextResponse.json({ success: true, ran: scriptOps.length });
        }

        if (action === "delete") {
            db.prepare("DELETE FROM patch_scripts WHERE id = ?").run(scriptId);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
