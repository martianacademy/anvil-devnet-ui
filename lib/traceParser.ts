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
    return raw.map((step: Record<string, unknown>) => ({
        pc: step.pc as number,
        op: step.op as string,
        gas: step.gas as number,
        gasCost: step.gasCost as number,
        depth: (step.depth as number) ?? 1,
        stack: (step.stack as string[]) ?? [],
        memory: (step.memory as string[]) ?? [],
        storage: (step.storage as Record<string, string>) ?? {},
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

const OPCODE_COLOR_MAP = new Map<string, string>([
    ["SSTORE", "text-orange-400"],
    ["SLOAD", "text-orange-400"],
    ["CALL", "text-blue-400"],
    ["DELEGATECALL", "text-blue-400"],
    ["STATICCALL", "text-blue-400"],
    ["CALLCODE", "text-blue-400"],
    ["REVERT", "text-red-400"],
    ["INVALID", "text-red-400"],
    ["RETURN", "text-green-400"],
    ["STOP", "text-green-400"],
    ["MSTORE", "text-purple-400"],
    ["MLOAD", "text-purple-400"],
    ["MSTORE8", "text-purple-400"],
    ["JUMP", "text-yellow-400"],
    ["JUMPI", "text-yellow-400"],
    ["JUMPDEST", "text-yellow-400"],
]);

export function getOpcodeColor(op: string): string {
    return OPCODE_COLOR_MAP.get(op) ?? "text-gray-300";
}
