import { NextResponse } from "next/server";
import { fundNative } from "@/lib/patcher";
import { setTokenBalance } from "@/lib/tokenBalances";
import { getDB } from "@/lib/db";
import { getAnvilState } from "@/lib/anvilProcess";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { type, address, amount, token, decimals = 18, mappingSlot } = body;
        const port = getAnvilState().config?.port ?? 8545;

        if (type === "native") {
            await fundNative(address, amount, port);
        } else if (type === "erc20") {
            const amountBig = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));
            await setTokenBalance(token, address, amountBig, port, mappingSlot);
        } else {
            return NextResponse.json({ error: "Unknown fund type" }, { status: 400 });
        }

        // Log to patch history
        const db = getDB();
        db.prepare(`
      INSERT INTO patch_history (type, target_address, payload, applied_at)
      VALUES (?, ?, ?, ?)
    `).run(
            type === "native" ? "fund_native" : "fund_erc20",
            address,
            JSON.stringify(body),
            Date.now()
        );

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
