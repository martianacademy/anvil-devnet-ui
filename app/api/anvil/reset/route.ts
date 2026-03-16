import { NextResponse } from "next/server";
import { getAnvilState, stopAnvil } from "@/lib/anvilProcess";
import { getDB } from "@/lib/db";
import fs from "fs";

export async function POST(req: Request) {
    try {
        let chainId: number | undefined;
        let forkUrl: string | undefined;

        try {
            const body = await req.json();
            chainId = body.chainId;
            forkUrl = body.forkUrl;
        } catch {
            // No body — fall back to running config
        }

        const state = getAnvilState();
        if (!chainId && state.config) {
            chainId = state.config.chainId;
            forkUrl = state.config.forkUrl;
        }

        // Stop Anvil if running
        if (state.proc && !state.proc.killed) {
            await stopAnvil(state.config?.port);
        }

        if (!chainId) {
            return NextResponse.json({ success: true, message: "No chain to reset" });
        }

        // Clear DB tables for this chain
        const db = getDB();
        db.prepare("DELETE FROM blocks WHERE chain_id = ?").run(chainId);
        db.prepare("DELETE FROM transactions WHERE chain_id = ?").run(chainId);
        db.prepare("DELETE FROM patch_history").run();

        // Delete state files (both fork and non-fork)
        const deleted: string[] = [];
        for (const suffix of ["", "-fork"]) {
            const file = `/tmp/anvil-state-${chainId}${suffix}.json`;
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                deleted.push(file);
            }
        }

        // Clear log
        const logFile = "/tmp/anvil-devnet.log";
        if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, "");
        }

        return NextResponse.json({ success: true, deleted, chainId });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
