import { getDB } from "./db";

export interface TxRecord {
    hash: string;
    block_number: number;
    block_timestamp: number;
    from_address: string;
    to_address: string | null;
    value: string;
    input: string | null;
    gas: string | null;
    gas_used: string | null;
    gas_price: string | null;
    nonce: number;
    status: number;
    revert_reason: string | null;
    decoded_function: string | null;
    decoded_params: string | null;
}

export interface BlockRecord {
    number: number;
    hash: string;
    timestamp: number;
    tx_count: number;
    gas_used: string | null;
    gas_limit: string | null;
}

export function insertBlock(block: BlockRecord) {
    const db = getDB();
    db.prepare(`
    INSERT OR REPLACE INTO blocks (number, hash, timestamp, tx_count, gas_used, gas_limit)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(block.number, block.hash, block.timestamp, block.tx_count, block.gas_used, block.gas_limit);
}

export function insertTx(tx: TxRecord) {
    const db = getDB();
    db.prepare(`
    INSERT OR REPLACE INTO transactions (
      hash, block_number, block_timestamp, from_address, to_address,
      value, input, gas, gas_used, gas_price, nonce, status,
      revert_reason, decoded_function, decoded_params
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        tx.hash, tx.block_number, tx.block_timestamp, tx.from_address, tx.to_address,
        tx.value, tx.input, tx.gas, tx.gas_used, tx.gas_price, tx.nonce, tx.status,
        tx.revert_reason, tx.decoded_function, tx.decoded_params
    );
}

export function getRecentTxs(limit = 100): TxRecord[] {
    const db = getDB();
    return db.prepare(`
    SELECT * FROM transactions ORDER BY block_number DESC, nonce DESC LIMIT ?
  `).all(limit) as TxRecord[];
}

export function getTxByHash(hash: string): TxRecord | null {
    const db = getDB();
    return db.prepare("SELECT * FROM transactions WHERE hash = ?").get(hash) as TxRecord | null;
}

export function getBlockByNumber(number: number): BlockRecord | null {
    const db = getDB();
    return db.prepare("SELECT * FROM blocks WHERE number = ?").get(number) as BlockRecord | null;
}

export function getRecentBlocks(limit = 50): BlockRecord[] {
    const db = getDB();
    return db.prepare("SELECT * FROM blocks ORDER BY number DESC LIMIT ?").all(limit) as BlockRecord[];
}

export function saveTxTrace(hash: string, structLogs: unknown, callTrace: unknown) {
    const db = getDB();
    db.prepare(`
    INSERT OR REPLACE INTO tx_traces (hash, struct_logs, call_trace, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hash, JSON.stringify(structLogs), JSON.stringify(callTrace), Date.now());
}

export function getTxTrace(hash: string) {
    const db = getDB();
    const row = db.prepare("SELECT * FROM tx_traces WHERE hash = ?").get(hash) as any;
    if (!row) return null;
    return {
        structLogs: JSON.parse(row.struct_logs),
        callTrace: JSON.parse(row.call_trace),
    };
}
