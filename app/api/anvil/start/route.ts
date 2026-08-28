import { startAnvil, type AnvilConfig } from "@/lib/anvilProcess";
import { resetRpcClients } from "@/lib/rpc";
import { invalidateActiveProjectCache } from "@/lib/activeProject";
import { syncExplorer } from "@/lib/explorerStack";
import { assertHttpUrl, assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

const DEFAULTS = {
    chainId: 31337,
    port: Number(process.env.DEVNET_RPC_PORT ?? 8545) || 8545,
    // Time still advances for contracts that need it — cooldowns, vesting,
    // staking — while a chain left running does not spend the day writing empty
    // blocks into the state dump. Each empty block costs about 1.7 KB there, so
    // two seconds is ~3 MB a day and fifteen is ~0.4 MB. Set 0 to mine only on
    // transactions; anything time-dependent then needs /api/anvil/time.
    blockTime: 15,
    accounts: 10,
    balance: 10000,
    baseFee: 0,
    /**
     * How often the chain is written to disk.
     *
     * Anvil's --dump-state writes on a clean exit and nowhere else, so a node
     * that is killed, crashes, or has its container recreated loses everything
     * since it started. Thirty seconds bounds that to roughly two blocks at the
     * default block time, for one small write.
     */
    stateInterval: 30,
} as const;

/** Validate + normalise an incoming Anvil config so bad input can't reach the CLI. */
export function parseAnvilConfig(body: Record<string, unknown>): AnvilConfig {
    return {
        chainId: assertInt(body.chainId ?? DEFAULTS.chainId, "chainId", 1, Number.MAX_SAFE_INTEGER),
        port: assertInt(body.port ?? DEFAULTS.port, "port", 1024, 65535),
        blockTime: assertInt(body.blockTime ?? DEFAULTS.blockTime, "blockTime", 0, 86400),
        accounts: assertInt(body.accounts ?? DEFAULTS.accounts, "accounts", 1, 1000),
        balance: assertInt(body.balance ?? DEFAULTS.balance, "balance", 0, 1_000_000_000),
        baseFee: assertInt(body.baseFee ?? DEFAULTS.baseFee, "baseFee", 0, Number.MAX_SAFE_INTEGER),
        stepsTracing: body.stepsTracing !== false,
        persistState: body.persistState !== false,
        stateInterval: assertInt(body.stateInterval ?? DEFAULTS.stateInterval, "stateInterval", 0, 86400),
        stateFile: typeof body.stateFile === "string" ? body.stateFile : "",
        forkUrl: body.forkUrl ? assertHttpUrl(body.forkUrl, "forkUrl") : undefined,
        forkBlockNumber: body.forkBlockNumber
            ? assertInt(body.forkBlockNumber, "forkBlockNumber", 0, Number.MAX_SAFE_INTEGER)
            : undefined,
        noMining: Boolean(body.noMining),
    };
}

export async function POST(req: Request) {
    return handleRoute(async () => {
        const config = parseAnvilConfig(await req.json());
        const resolved = await startAnvil(config);
        resetRpcClients();
        invalidateActiveProjectCache();

        // A fresh node means a fresh chain: point the explorer at it and drop the
        // index of whatever chain it was serving before.
        // On a fork, the indexer must start at the fork block. From 0 it would walk
        // the forked chain's whole history through the fork RPC.
        const explorerSync = syncExplorer(resolved.chainId, resolved.port, resolved.forkBlockNumber ?? 0);

        return {
            success: true,
            port: resolved.port,
            chainId: resolved.chainId,
            forkBlockNumber: resolved.forkBlockNumber ?? null,
            rpcUrl: `http://127.0.0.1:${resolved.port}`,
            explorerSync,
        };
    });
}
