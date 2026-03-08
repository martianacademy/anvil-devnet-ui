import { NextResponse } from "next/server";
import { rpc } from "@/lib/rpc";

export async function POST(req: Request) {
    try {
        const { action, address } = await req.json();

        if (action === "start") {
            await rpc("anvil_impersonateAccount", [address]);
            return NextResponse.json({ success: true, impersonating: address });
        } else if (action === "stop") {
            await rpc("anvil_stopImpersonatingAccount", [address]);
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
