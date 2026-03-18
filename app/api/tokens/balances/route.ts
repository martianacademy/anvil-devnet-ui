import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { fetchTokenBalance } from "@/lib/tokenBalances";
import { getAnvilState } from "@/lib/anvilProcess";

interface WatchlistRow { id: number; token_address: string; wallet_address: string; token_name?: string; token_symbol?: string; token_decimals: number; token_type: string }

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const db = getDB();
        const watchlist = db.prepare("SELECT * FROM token_watchlist ORDER BY added_at DESC").all() as WatchlistRow[];
        const port = getAnvilState().config?.port ?? 8545;

        const balances = await Promise.all(
            watchlist.map(async (w) => ({
                ...w,
                balance: await fetchTokenBalance(w.token_address, w.wallet_address, port),
            }))
        );

        return NextResponse.json(balances);
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
