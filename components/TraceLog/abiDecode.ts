import { decodeFunctionData, decodeEventLog, type Abi } from "viem";
import { shortAddr } from "./utils";

export interface DecodedCall {
    name: string;
    params: { label: string; value: string }[];
}

export interface DecodedLog {
    name: string;
    params: { label: string; value: string }[];
}

/** Format an ABI-decoded argument value for display */
function formatArg(value: unknown): string {
    if (value === undefined || value === null) return "—";
    if (typeof value === "bigint") {
        if (value > BigInt("1000000000000000")) {
            const eth = Number(value) / 1e18;
            if (eth >= 0.001 && eth < 1e15) {
                return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
            }
        }
        if (value < 1000000n) return value.toString();
        return value.toLocaleString();
    }
    if (typeof value === "string") {
        if (value.startsWith("0x") && value.length === 42) {
            return shortAddr(value);
        }
        return value;
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) return `[${value.map(formatArg).join(", ")}]`;
    return String(value);
}

/** Decode calldata using a contract ABI (viem) */
export function decodeCallWithAbi(
    abi: Abi,
    input: string
): DecodedCall | null {
    try {
        if (!input || input.length < 10) return null;
        const decoded = decodeFunctionData({
            abi,
            data: input as `0x${string}`,
        });

        const abiItem = (abi as unknown as Array<{
            type: string;
            name?: string;
            inputs?: Array<{ name: string; type: string }>;
        }>).find(
            (item) => item.type === "function" && item.name === decoded.functionName
        );

        const params: { label: string; value: string }[] = [];
        const args = decoded.args as unknown[];
        if (args && abiItem?.inputs) {
            for (let i = 0; i < abiItem.inputs.length; i++) {
                params.push({
                    label: abiItem.inputs[i].name || `arg${i}`,
                    value: formatArg(args[i]),
                });
            }
        }

        return { name: decoded.functionName, params };
    } catch {
        return null;
    }
}

/** Decode an event log using a contract ABI (viem) */
export function decodeLogWithAbi(
    abi: Abi,
    topics: string[],
    data?: string
): DecodedLog | null {
    try {
        if (!topics.length) return null;
        const decoded = decodeEventLog({
            abi,
            topics: topics as [`0x${string}`, ...`0x${string}`[]],
            data: (data ?? "0x") as `0x${string}`,
        });

        const abiItem = (abi as unknown as Array<{
            type: string;
            name?: string;
            inputs?: Array<{ name: string; type: string; indexed?: boolean }>;
        }>).find(
            (item) => item.type === "event" && item.name === decoded.eventName
        );

        const params: { label: string; value: string }[] = [];
        const args = decoded.args as unknown as Record<string, unknown>;
        if (args && abiItem?.inputs) {
            for (const input of abiItem.inputs) {
                if (input.name in args) {
                    params.push({
                        label: input.name,
                        value: formatArg(args[input.name]),
                    });
                }
            }
        }

        return { name: decoded.eventName ?? "unknown", params };
    } catch {
        return null;
    }
}
