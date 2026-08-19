import { PROFILE_PRESETS, deleteProfile, getAllProfiles, saveProfile, setActiveProfile } from "@/lib/chainProfiles";
import { assertHttpUrl, assertInt, assertNonEmptyString } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET() {
    return handleRoute(async () => ({ profiles: getAllProfiles(), presets: PROFILE_PRESETS }));
}

export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json();
        saveProfile({
            name: assertNonEmptyString(body.name, "name", 60),
            chainId: assertInt(body.chainId ?? 31337, "chainId", 1, Number.MAX_SAFE_INTEGER),
            forkUrl: body.forkUrl ? assertHttpUrl(body.forkUrl, "forkUrl") : undefined,
            forkBlockNumber: body.forkBlockNumber ? assertInt(body.forkBlockNumber, "forkBlockNumber", 0, Number.MAX_SAFE_INTEGER) : undefined,
            blockTime: assertInt(body.blockTime ?? 2, "blockTime", 0, 86_400),
            baseFee: assertInt(body.baseFee ?? 0, "baseFee", 0, Number.MAX_SAFE_INTEGER),
            port: assertInt(body.port ?? 8545, "port", 1024, 65535),
            accounts: assertInt(body.accounts ?? 10, "accounts", 1, 1000),
            balance: assertInt(body.balance ?? 10000, "balance", 0, 1_000_000_000),
            stateFile: typeof body.stateFile === "string" ? body.stateFile : undefined,
        });
        return { success: true };
    });
}

export async function DELETE(req: Request) {
    return handleRoute(async () => {
        const { name } = await req.json();
        deleteProfile(assertNonEmptyString(name, "name", 60));
        return { success: true };
    });
}

export async function PATCH(req: Request) {
    return handleRoute(async () => {
        const { name } = await req.json();
        setActiveProfile(assertNonEmptyString(name, "name", 60));
        return { success: true };
    });
}
