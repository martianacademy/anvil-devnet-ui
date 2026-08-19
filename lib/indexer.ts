import { decodeInput, getName } from "./abiRegistry.ts";
import type { BlockRecord, TxRecord } from "./txStore.ts";

/** Minimal shape of `eth_getBlockByNumber` with full transactions. */
export interface RpcTx {
    hash: string;
    from: string;
    to?: string | null;
    value?: string;
    input?: string;
    gas?: string;
    gasPrice?: string;
    nonce?: string;
}

export interface RpcBlock {
    number?: string;
    hash?: string;
    timestamp?: string;
    gasUsed?: string;
    gasLimit?: string;
    transactions?: RpcTx[];
}

export interface RpcReceipt {
    transactionHash?: string;
    gasUsed?: string;
    status?: string;
    contractAddress?: string | null;
}

export function hexToNumber(hex: string | undefined | null, fallback = 0): number {
    if (!hex) return fallback;
    const n = typeof hex === "string" && hex.startsWith("0x") ? parseInt(hex, 16) : Number(hex);
    return Number.isFinite(n) ? n : fallback;
}

export interface ScopeIds {
    chainId: number;
    projectId: string | null;
}

export function toBlockRecord(block: RpcBlock, number: number, scope: ScopeIds): BlockRecord {
    return {
        chain_id: scope.chainId,
        number,
        hash: block.hash ?? "",
        timestamp: hexToNumber(block.timestamp),
        tx_count: block.transactions?.length ?? 0,
        gas_used: block.gasUsed ?? null,
        gas_limit: block.gasLimit ?? null,
        project_id: scope.projectId,
    };
}

export function toTxRecord(
    tx: RpcTx,
    blockNumber: number,
    blockTimestamp: number,
    receipt: RpcReceipt | null,
    scope: ScopeIds
): TxRecord {
    const decoded = tx.to && tx.input && tx.input !== "0x" ? decodeInput(tx.to, tx.input) : null;
    return {
        hash: tx.hash,
        chain_id: scope.chainId,
        block_number: blockNumber,
        block_timestamp: blockTimestamp,
        from_address: tx.from,
        to_address: tx.to ?? null,
        value: tx.value ?? "0x0",
        input: tx.input ?? null,
        gas: tx.gas ?? null,
        gas_used: receipt?.gasUsed ?? null,
        gas_price: tx.gasPrice ?? null,
        nonce: hexToNumber(tx.nonce),
        status: receipt ? hexToNumber(receipt.status, 1) : 1,
        revert_reason: null,
        decoded_function: decoded?.functionName ?? null,
        decoded_params: decoded ? safeStringify(decoded.args) : null,
        project_id: scope.projectId,
    };
}

/** Live event payload pushed over SSE for a newly indexed transaction. */
export function toTxEvent(record: TxRecord) {
    return {
        type: "tx" as const,
        hash: record.hash,
        from: record.from_address,
        to: record.to_address,
        value: record.value,
        gasUsed: record.gas_used ?? "0x0",
        status: record.status === 1 ? "success" : "failed",
        blockNumber: record.block_number,
        blockTimestamp: record.block_timestamp,
        decodedFunction: record.decoded_function,
        contractName: record.to_address ? getName(record.to_address) : null,
    };
}

/** BigInt-safe JSON — viem decodes uint256 args as bigint, which JSON.stringify rejects. */
export function safeStringify(value: unknown): string | null {
    try {
        return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
        return null;
    }
}
