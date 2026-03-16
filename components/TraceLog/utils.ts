import type { TraceEntry, TraceKind } from "./types";
import type { EvmStep, CallNode } from "@/lib/traceParser";

/* ─── Well-known selectors ─── */
const SELECTORS: Record<string, { name: string; params: string[] }> = {
    "0x70a08231": { name: "balanceOf", params: ["address"] },
    "0xa9059cbb": { name: "transfer", params: ["address", "uint256"] },
    "0x23b872dd": { name: "transferFrom", params: ["address", "address", "uint256"] },
    "0x095ea7b3": { name: "approve", params: ["address", "uint256"] },
    "0xdd62ed3e": { name: "allowance", params: ["address", "address"] },
    "0x18160ddd": { name: "totalSupply", params: [] },
    "0x313ce567": { name: "decimals", params: [] },
    "0x06fdde03": { name: "name", params: [] },
    "0x95d89b41": { name: "symbol", params: [] },
    "0x40c10f19": { name: "mint", params: ["address", "uint256"] },
    "0x42966c68": { name: "burn", params: ["uint256"] },
    "0x3ccfd60b": { name: "withdraw", params: [] },
    "0xd0e30db0": { name: "deposit", params: [] },
    "0x2e1a7d4d": { name: "withdraw", params: ["uint256"] },
    "0x1249c58b": { name: "mint", params: [] },
    "0xa0712d68": { name: "mint", params: ["uint256"] },
    "0x39509351": { name: "increaseAllowance", params: ["address", "uint256"] },
    "0xa457c2d7": { name: "decreaseAllowance", params: ["address", "uint256"] },
    "0x79cc6790": { name: "burnFrom", params: ["address", "uint256"] },
};

/* ─── Well-known events ─── */
const EVENTS: Record<string, { name: string; params: string[] }> = {
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef":
        { name: "Transfer", params: ["from", "to", "value"] },
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925":
        { name: "Approval", params: ["owner", "spender", "value"] },
};

/* ─── Helpers ─── */
function classifyOp(op: string): TraceKind {
    if (["CALL", "DELEGATECALL", "STATICCALL", "CALLCODE"].includes(op)) {
        return op === "CALLCODE" ? "CALL" : (op as TraceKind);
    }
    if (["CREATE", "CREATE2"].includes(op)) return "CREATE";
    if (op === "SLOAD") return "SLOAD";
    if (op === "SSTORE") return "SSTORE";
    if (op.startsWith("LOG")) return "LOG";
    if (["JUMP", "JUMPI", "JUMPDEST"].includes(op)) return "JUMP";
    if (op === "RETURN" || op === "STOP") return "RETURN";
    if (op === "REVERT" || op === "INVALID") return "REVERT";
    return "OTHER";
}

/** Normalize hex: ensure exactly one 0x prefix */
function hex0x(val: string): string {
    if (!val) return "0x0";
    const s = val.replace(/^(0x)+/i, "");
    return "0x" + s;
}

export function shortAddr(addr: string): string {
    if (!addr) return "—";
    const a = hex0x(addr);
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shortHex(hex: string, maxLen = 16): string {
    if (!hex) return "—";
    const h = hex0x(hex);
    if (h.length <= maxLen) return h;
    return `${h.slice(0, maxLen)}…${h.slice(-4)}`;
}

/** Decode a slot into an address from a 32-byte hex value */
function extractAddr(hex: string): string {
    const h = hex.replace("0x", "").padStart(64, "0");
    return "0x" + h.slice(24);
}

/** Format a uint256 hex value as a human-readable number (decimals) */
function formatUint(hex: string, tryDecimals = true): string {
    try {
        const n = BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
        if (n === 0n) return "0";
        if (tryDecimals && n > BigInt("1000000000000000")) {
            const eth = Number(n) / 1e18;
            if (eth >= 0.001 && eth < 1e15) return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
        }
        if (n < 1000000n) return n.toString();
        return n.toLocaleString();
    } catch {
        return shortHex(hex);
    }
}

/** Decode function params from calldata using known selector info */
export function decodeCalldata(input: string): {
    name: string;
    decodedParams: string[];
} | undefined {
    if (!input || input.length < 10) return undefined;
    const sel = input.slice(0, 10).toLowerCase();
    const info = SELECTORS[sel];
    if (!info) return undefined;

    const data = input.slice(10);
    const decoded: string[] = [];

    for (let i = 0; i < info.params.length; i++) {
        const chunk = data.slice(i * 64, (i + 1) * 64);
        if (!chunk) break;

        const pType = info.params[i];
        if (pType === "address") {
            decoded.push(shortAddr(extractAddr(chunk)));
        } else if (pType === "uint256") {
            decoded.push(formatUint(chunk));
        } else {
            decoded.push(shortHex("0x" + chunk));
        }
    }

    return { name: info.name, decodedParams: decoded };
}

/** Decode LOG event from topics and data */
export function decodeEvent(topics: string[], data?: string): {
    name: string;
    decodedParams: { label: string; value: string }[];
} | undefined {
    if (!topics.length) return undefined;
    const t0 = topics[0].startsWith("0x") ? topics[0].toLowerCase() : "0x" + topics[0].toLowerCase();
    const info = EVENTS[t0];
    if (!info) return undefined;

    const params: { label: string; value: string }[] = [];

    // Indexed params from topics[1..]
    for (let i = 1; i < topics.length && i - 1 < info.params.length; i++) {
        const label = info.params[i - 1];
        const raw = topics[i];
        if (label === "from" || label === "to" || label === "owner" || label === "spender") {
            params.push({ label, value: shortAddr(extractAddr(raw)) });
        } else {
            params.push({ label, value: formatUint(raw) });
        }
    }

    // Non-indexed params from data
    if (data && data.length > 2) {
        const d = data.replace("0x", "");
        let paramIdx = topics.length - 1;
        for (let i = 0; i * 64 < d.length && paramIdx < info.params.length; i++, paramIdx++) {
            const chunk = d.slice(i * 64, (i + 1) * 64);
            const label = info.params[paramIdx];
            if (label === "from" || label === "to" || label === "owner" || label === "spender") {
                params.push({ label, value: shortAddr(extractAddr(chunk)) });
            } else {
                params.push({ label, value: formatUint(chunk) });
            }
        }
    }

    return { name: info.name, decodedParams: params };
}

/* ─── Convert struct logs to entries (only important ops) ─── */
export function structLogsToEntries(steps: EvmStep[]): TraceEntry[] {
    const entries: TraceEntry[] = [];
    let idx = 0;

    for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const kind = classifyOp(s.op);
        const stack = s.stack ?? [];
        const stackTop = stack.slice(-4).reverse();

        const entry: TraceEntry = {
            idx: idx++,
            op: s.op,
            kind,
            gas: s.gas,
            gasCost: s.gasCost,
            depth: s.depth ?? 1,
            pc: s.pc,
            stackTop,
        };

        // SLOAD: extract slot and loaded value
        if (kind === "SLOAD" && stack.length >= 1) {
            entry.slot = hex0x(stack[stack.length - 1]);
            if (i + 1 < steps.length) {
                const nextStack = steps[i + 1].stack ?? [];
                if (nextStack.length > 0) {
                    entry.value = hex0x(nextStack[nextStack.length - 1]);
                }
            }
        }

        // SSTORE: extract slot and value
        if (kind === "SSTORE" && stack.length >= 2) {
            entry.slot = hex0x(stack[stack.length - 1]);
            entry.value = hex0x(stack[stack.length - 2]);
        }

        // LOG: extract topics and data from memory
        if (kind === "LOG") {
            const topicCount = parseInt(s.op.replace("LOG", ""), 10) || 0;
            if (stack.length >= 2 + topicCount) {
                // Stack layout for LOG{n}: [..., topic_n-1, ..., topic_0, size, offset]
                const topics: string[] = [];
                for (let t = 0; t < topicCount; t++) {
                    topics.push(hex0x(stack[stack.length - 3 - t]));
                }
                entry.topics = topics;

                // Read log data from memory
                const memOffsetRaw = stack[stack.length - 1];
                const memSizeRaw = stack[stack.length - 2];
                const memOffset = parseInt(memOffsetRaw.replace(/^0x/i, ""), 16);
                const memSize = parseInt(memSizeRaw.replace(/^0x/i, ""), 16);
                if (s.memory && memSize > 0) {
                    const memJoined = s.memory.join("");
                    const byteOffset = memOffset * 2;
                    entry.logData = "0x" + memJoined.slice(byteOffset, byteOffset + memSize * 2);
                }

                // Decode the event
                const decoded = decodeEvent(topics, entry.logData);
                if (decoded) {
                    entry.decoded = decoded.name;
                    entry.decodedEventParams = decoded.decodedParams;
                }
            }
        }

        // CALL: extract target address and calldata
        if (kind === "CALL" && stack.length >= 7) {
            entry.callValue = hex0x(stack[stack.length - 3]);
            const rawTo = stack[stack.length - 2].replace(/^0x/i, "");
            entry.to = "0x" + rawTo.slice(-40);
            // Try to get calldata from memory
            const argsOffset = parseInt(stack[stack.length - 4].replace(/^0x/i, ""), 16);
            const argsSize = parseInt(stack[stack.length - 5].replace(/^0x/i, ""), 16);
            if (s.memory && argsSize > 0) {
                const memJoined = s.memory.join("");
                const byteOffset = argsOffset * 2;
                entry.input = "0x" + memJoined.slice(byteOffset, byteOffset + argsSize * 2);
                const d = decodeCalldata(entry.input);
                if (d) entry.decoded = d.name;
                entry.decodedCallParams = d?.decodedParams;
            }
        }

        if ((kind === "STATICCALL" || kind === "DELEGATECALL") && stack.length >= 6) {
            const rawTo = stack[stack.length - 2].replace(/^0x/i, "");
            entry.to = "0x" + rawTo.slice(-40);
            const argsOffset = parseInt(stack[stack.length - 3].replace(/^0x/i, ""), 16);
            const argsSize = parseInt(stack[stack.length - 4].replace(/^0x/i, ""), 16);
            if (s.memory && argsSize > 0) {
                const memJoined = s.memory.join("");
                const byteOffset = argsOffset * 2;
                entry.input = "0x" + memJoined.slice(byteOffset, byteOffset + argsSize * 2);
                const d = decodeCalldata(entry.input);
                if (d) entry.decoded = d.name;
                entry.decodedCallParams = d?.decodedParams;
            }
        }

        entries.push(entry);
    }

    return entries;
}

/* ─── Convert call trace (callTracer) to entries ─── */
export function callTraceToEntries(
    node: CallNode,
    depth = 1,
    startIdx = 0
): TraceEntry[] {
    const entries: TraceEntry[] = [];
    const kind = classifyOp(node.type ?? "CALL");
    const d = decodeCalldata(node.input ?? "");

    entries.push({
        idx: startIdx,
        op: node.type ?? "CALL",
        kind,
        gas: parseInt(node.gas ?? "0", 16),
        gasCost: parseInt(node.gasUsed ?? "0", 16),
        depth,
        pc: 0,
        to: node.to,
        input: node.input,
        callValue: node.value,
        decoded: d?.name,
        decodedCallParams: d?.decodedParams,
        error: !!node.error,
    });

    let idx = startIdx + 1;
    if (node.calls) {
        for (const child of node.calls) {
            const childEntries = callTraceToEntries(child, depth + 1, idx);
            entries.push(...childEntries);
            idx += childEntries.length;
        }
    }

    return entries;
}
