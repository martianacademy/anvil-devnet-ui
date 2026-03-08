import { NextResponse } from "next/server";
import { saveContract, getAllContracts } from "@/lib/abiRegistry";

export async function GET() {
    try {
        const contracts = getAllContracts();
        return NextResponse.json(contracts.map((c) => ({
            address: c.address,
            name: c.name,
            abiMethodCount: Array.isArray(c.abi) ? (c.abi as any[]).filter((x: any) => x.type === "function").length : 0,
            verified_at: c.verified_at,
        })));
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { address, name, abi, source } = await req.json();
        if (!address || !name || !abi) {
            return NextResponse.json({ error: "address, name, and abi are required" }, { status: 400 });
        }
        const parsedAbi = typeof abi === "string" ? JSON.parse(abi) : abi;
        saveContract(address, name, parsedAbi, source);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
