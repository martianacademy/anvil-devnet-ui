/**
 * Turning any address into a contract.
 *
 * `anvil_setCode` only takes *runtime* bytecode, so it never runs a constructor —
 * an address patched that way has the right functions and completely empty
 * storage (an ERC-20 with no name, no symbol, no supply). To get the storage as
 * well, the creation bytecode is executed inside `debug_traceCall`, which runs
 * the constructor without mining anything or touching the chain, and the
 * prestate tracer reports exactly what it would have written.
 *
 * Caveat worth knowing: a constructor that bakes `address(this)` into an
 * immutable records the simulated deployment address, not the address the code
 * ends up at. Tokens and most test doubles do not care; a contract that checks
 * its own address will.
 */
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { rpc } from "./rpc.ts";
import { MOCK_ERC20_CREATION_BYTECODE } from "./mockErc20.ts";

/** Generous enough for any constructor; the call is simulated, so nobody pays it. */
const DEPLOY_GAS = "0x2000000";
/**
 * The simulated deployment is charged to this address at a zero gas price, so it
 * needs no balance and no unlocked key.
 */
const SIMULATED_DEPLOYER = "0x00000000000000000000000000000000000000a0";

const ERC20_CONSTRUCTOR = parseAbiParameters("string, string, uint8, uint256, address");

interface PrestateAccount {
    code?: string;
    storage?: Record<string, string>;
}

interface PrestateDiff {
    post?: Record<string, PrestateAccount>;
}

export interface SimulatedDeployment {
    /** Runtime bytecode the constructor returned. */
    code: string;
    /** Every slot the constructor wrote, keyed by 32-byte slot. */
    storage: Record<string, string>;
    /** Address the simulation deployed to — only matters for immutables. */
    simulatedAt: string;
}

export interface ErcTokenParams {
    name: string;
    symbol: string;
    decimals: number;
    /** Base units, already scaled by decimals. */
    totalSupply: bigint;
    /** Receives the whole supply. */
    holder: string;
}

/** Creation bytecode for the built-in ERC-20, with its constructor arguments appended. */
export function erc20CreationBytecode(params: ErcTokenParams): string {
    const args = encodeAbiParameters(ERC20_CONSTRUCTOR, [
        params.name,
        params.symbol,
        params.decimals,
        params.totalSupply,
        params.holder as `0x${string}`,
    ]);
    return `${MOCK_ERC20_CREATION_BYTECODE}${args.slice(2)}`;
}

/**
 * Run creation bytecode without committing anything, and report the code and
 * storage it would have produced.
 */
export async function simulateDeployment(creationBytecode: string, port?: number): Promise<SimulatedDeployment> {
    const call = { from: SIMULATED_DEPLOYER, data: creationBytecode, gas: DEPLOY_GAS, gasPrice: "0x0" };

    // eth_call first: a reverting constructor reports its reason here, while the
    // tracer would just return a diff with nothing in it.
    const code = await rpc<string>("eth_call", [call, "latest"], port);
    if (!code || code === "0x") {
        throw new Error("The constructor deployed no code — check the bytecode and its arguments");
    }

    const diff = await rpc<PrestateDiff>(
        "debug_traceCall",
        [call, "latest", { tracer: "prestateTracer", tracerConfig: { diffMode: true } }],
        port
    );

    const created = Object.entries(diff?.post ?? {}).find(([, account]) => account.code);
    return {
        code,
        storage: created?.[1].storage ?? {},
        simulatedAt: created?.[0] ?? SIMULATED_DEPLOYER,
    };
}

export interface InstalledCode {
    address: string;
    codeSize: number;
    slotsWritten: number;
}

/** Write runtime code and storage at an address. */
export async function installCode(
    address: string,
    code: string,
    storage: Record<string, string>,
    port?: number
): Promise<InstalledCode> {
    await rpc("anvil_setCode", [address, code], port);

    const slots = Object.entries(storage);
    for (const [slot, value] of slots) {
        await rpc("anvil_setStorageAt", [address, slot, value], port);
    }

    return { address, codeSize: code.length / 2 - 1, slotsWritten: slots.length };
}

/** Simulate a deployment and install the result at `address`, in one step. */
export async function deployAt(
    address: string,
    creationBytecode: string,
    port?: number
): Promise<InstalledCode & { simulatedAt: string }> {
    const deployment = await simulateDeployment(creationBytecode, port);
    const installed = await installCode(address, deployment.code, deployment.storage, port);
    return { ...installed, simulatedAt: deployment.simulatedAt };
}
