export interface EvmStep {
    pc: number;
    op: string;
    gas: number;
    gasCost: number;
    depth: number;
    stack: string[];
    memory: string[];
    storage: Record<string, string>;
}

export interface CallNode {
    type: string; // CALL, DELEGATECALL, STATICCALL, CREATE, etc.
    from: string;
    to: string;
    input: string;
    output?: string;
    gas: string;
    gasUsed?: string;
    value?: string;
    calls?: CallNode[];
    error?: string;
}

export interface StorageDiff {
    contract: string;
    slot: string;
    before: string;
    after: string;
}

export function parseStructLogs(raw: unknown): EvmStep[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((step: any) => ({
        pc: step.pc,
        op: step.op,
        gas: step.gas,
        gasCost: step.gasCost,
        depth: step.depth ?? 1,
        stack: step.stack ?? [],
        memory: step.memory ?? [],
        storage: step.storage ?? {},
    }));
}

export function extractStorageDiffs(steps: EvmStep[]): StorageDiff[] {
    const diffs: StorageDiff[] = [];
    const seen = new Map<string, string>();

    for (const step of steps) {
        if (step.op === "SSTORE") {
            const slot = step.stack[step.stack.length - 1];
            const value = step.stack[step.stack.length - 2];
            if (slot) {
                const key = `unknown:${slot}`;
                const before = seen.get(key) ?? "0x0";
                diffs.push({ contract: "unknown", slot, before, after: value ?? "0x0" });
                seen.set(key, value ?? "0x0");
            }
        }
    }

    return diffs;
}

export function formatMemory(memory: string[]): string {
    return memory.join("");
}

export function getOpcodeColor(op: string): string {
    if (["SSTORE", "SLOAD"].includes(op)) return "text-orange-400";
    if (["CALL", "DELEGATECALL", "STATICCALL", "CALLCODE"].includes(op)) return "text-blue-400";
    if (["REVERT", "INVALID"].includes(op)) return "text-red-400";
    if (["RETURN", "STOP"].includes(op)) return "text-green-400";
    if (["MSTORE", "MLOAD", "MSTORE8"].includes(op)) return "text-purple-400";
    if (["JUMP", "JUMPI", "JUMPDEST"].includes(op)) return "text-yellow-400";
    return "text-gray-300";
}
