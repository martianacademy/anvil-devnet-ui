import { NextResponse } from "next/server";
import { getContract, autoFetchABI } from "@/lib/abiRegistry";
import { getDB } from "@/lib/db";
import { getAnvilState } from "@/lib/anvilProcess";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const { address } = await params;
        const contract = getContract(address);

        if (!contract) {
            const state = getAnvilState();
            const chainId = state.config?.chainId ?? 1;
            const abi = await autoFetchABI(address, chainId);
            if (!abi) {
                return NextResponse.json({ error: "Contract not found" }, { status: 404 });
            }
            return NextResponse.json(getContract(address));
        }

        return NextResponse.json(contract);
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ address: string }> }
) {
    try {
        const { address } = await params;
        const db = getDB();
        db.prepare("DELETE FROM contracts WHERE lower(address) = ?").run(address.toLowerCase());
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
