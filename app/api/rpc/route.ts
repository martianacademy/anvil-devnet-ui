import { NextResponse } from "next/server";
import { getAnvilState } from "@/lib/anvilProcess";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const port = getAnvilState().config?.port ?? 8545;
        const response = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return NextResponse.json(await response.json());
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
