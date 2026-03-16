import { NextResponse } from "next/server";
import { batchFetchABIs } from "@/lib/abiRegistry";
import { getAnvilState } from "@/lib/anvilProcess";

/**
 * POST /api/abi/batch
 * Body: { addresses: string[] }
 * Returns: { abis: Record<address, ABI[]> }
 *
 * Looks up ABIs for multiple addresses at once.
 * Auto-fetches from Sourcify and Etherscan/BSCScan if not already cached.
 */
export async function POST(req: Request) {
    try {
        const { addresses } = await req.json();
        if (!Array.isArray(addresses)) {
            return NextResponse.json({ error: "addresses must be an array" }, { status: 400 });
        }

        const state = getAnvilState();
        const chainId = state.config?.chainId ?? 31337;

        const abis = await batchFetchABIs(addresses, chainId);
        return NextResponse.json({ abis });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
