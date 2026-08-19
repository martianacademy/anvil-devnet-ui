import { getAllContracts, saveContract } from "@/lib/abiRegistry";
import { ValidationError, assertAddress, assertNonEmptyString } from "@/lib/validate";
import { handleRoute } from "@/lib/route";
import type { Abi } from "viem";

export const dynamic = "force-dynamic";

export async function GET() {
    return handleRoute(async () =>
        getAllContracts().map((c) => ({
            address: c.address,
            name: c.name,
            abiMethodCount: c.abi.filter((x) => x.type === "function").length,
            hasSource: Boolean(c.source),
            verified_at: c.verified_at,
        }))
    );
}

export async function POST(req: Request) {
    return handleRoute(async () => {
        const { address, name, abi, source } = await req.json();
        const target = assertAddress(address);
        const contractName = assertNonEmptyString(name, "name", 100);

        let parsed: Abi;
        try {
            parsed = typeof abi === "string" ? JSON.parse(abi) : abi;
        } catch {
            throw new ValidationError("abi must be valid JSON");
        }
        if (!Array.isArray(parsed)) throw new ValidationError("abi must be a JSON array");

        saveContract(target, contractName, parsed, typeof source === "string" ? source : undefined);
        return { success: true, address: target, name: contractName };
    });
}
