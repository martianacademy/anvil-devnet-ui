import { batchFetchABIs } from "@/lib/abiRegistry";
import { resolveFromRequest } from "@/lib/activeProject";
import { ValidationError } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

const MAX_ADDRESSES = 100;

/**
 * POST /api/abi/batch  { addresses: string[] } → { abis: Record<address, Abi> }
 * Looks up ABIs locally, then falls back to Sourcify / block explorers.
 */
export async function POST(req: Request) {
    return handleRoute(async () => {
        const { addresses } = await req.json();
        if (!Array.isArray(addresses)) throw new ValidationError("addresses must be an array");
        if (addresses.length > MAX_ADDRESSES) {
            throw new ValidationError(`at most ${MAX_ADDRESSES} addresses per request`);
        }

        const valid = addresses.filter((a): a is string => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a));
        const { chainId } = resolveFromRequest(req);
        return { abis: await batchFetchABIs(valid, chainId) };
    });
}
