import { autoFetchABI, deleteContract, getContract } from "@/lib/abiRegistry";
import { resolveFromRequest } from "@/lib/activeProject";
import { HttpError, assertAddress } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
    return handleRoute(async () => {
        const address = assertAddress((await params).address);
        const local = getContract(address);
        if (local) return local;

        const { chainId } = resolveFromRequest(req);
        const abi = await autoFetchABI(address, chainId);
        if (!abi) throw new HttpError(404, "Contract not found — upload an ABI or verify it on Sourcify/Etherscan");
        return getContract(address);
    });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ address: string }> }) {
    return handleRoute(async () => {
        const address = assertAddress((await params).address);
        return { success: deleteContract(address) };
    });
}
