import { decodeInput, decodeEvent, getName } from "./abiRegistry";

export interface DecodedTx {
    functionName?: string;
    args?: unknown;
    contractName?: string;
}

export function decodeTx(address: string, inputData: string): DecodedTx {
    const decoded = decodeInput(address, inputData);
    const name = getName(address);
    return {
        functionName: decoded?.functionName,
        args: decoded?.args,
        contractName: name ?? undefined,
    };
}

export function decodeSelector(data: string): string {
    if (!data || data.length < 10) return "unknown";
    return data.slice(0, 10);
}
