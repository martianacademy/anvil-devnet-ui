import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { fetchTokenBalance } from "@/lib/tokenBalances";
import { getAnvilState } from "@/lib/anvilProcess";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const db = getDB();
        const watchlist = db.prepare("SELECT * FROM token_watchlist ORDER BY added_at DESC").all() as any[];
        const port = getAnvilState().config?.port ?? 8545;

        const balances = await Promise.all(
            watchlist.map(async (w) => ({
                ...w,
                balance: await fetchTokenBalance(w.token_address, w.wallet_address, port),
            }))
        );

        return NextResponse.json(balances);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
