import { getDB, scopeId } from "./db.ts";

export interface TxRecord {
    hash: string;
    chain_id: number;
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
    project_id?: string | null;
}

export interface BlockRecord {
    chain_id: number;
    number: number;
    hash: string;
    timestamp: number;
    tx_count: number;
    gas_used: string | null;
    gas_limit: string | null;
    project_id?: string | null;
}

const INSERT_BLOCK = `
  INSERT OR REPLACE INTO blocks (chain_id, project_id, number, hash, timestamp, tx_count, gas_used, gas_limit)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_TX = `
  INSERT OR REPLACE INTO transactions (
    hash, chain_id, block_number, block_timestamp, from_address, to_address,
    value, input, gas, gas_used, gas_price, nonce, status,
    revert_reason, decoded_function, decoded_params, project_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function blockParams(b: BlockRecord) {
    return [b.chain_id, scopeId(b.project_id), b.number, b.hash, b.timestamp, b.tx_count, b.gas_used, b.gas_limit] as const;
}

function txParams(t: TxRecord) {
    return [
        t.hash, t.chain_id, t.block_number, t.block_timestamp, t.from_address, t.to_address,
        t.value, t.input, t.gas, t.gas_used, t.gas_price, t.nonce, t.status,
        t.revert_reason, t.decoded_function, t.decoded_params, scopeId(t.project_id),
    ] as const;
}

export function insertBlock(block: BlockRecord) {
    getDB().prepare(INSERT_BLOCK).run(...blockParams(block));
}

export function insertTx(tx: TxRecord) {
    getDB().prepare(INSERT_TX).run(...txParams(tx));
}

/** Single-transaction batch write — used by the live indexer. */
export function insertBlocksAndTxs(blocks: BlockRecord[], txs: TxRecord[]) {
    if (blocks.length === 0 && txs.length === 0) return;
    const db = getDB();
    const insertBlockStmt = db.prepare(INSERT_BLOCK);
    const insertTxStmt = db.prepare(INSERT_TX);
    db.transaction(() => {
        for (const b of blocks) insertBlockStmt.run(...blockParams(b));
        for (const t of txs) insertTxStmt.run(...txParams(t));
    })();
}

export interface ScopeFilter {
    chainId: number;
    projectId?: string | null;
}

export function getRecentTxs(chainId: number, limit = 100, projectId: string | null = null): TxRecord[] {
    return getDB().prepare(`
      SELECT * FROM transactions
       WHERE chain_id = ? AND project_id = ?
       ORDER BY block_number DESC, nonce DESC
       LIMIT ?
    `).all(chainId, scopeId(projectId), limit) as TxRecord[];
}

export function countTxs(chainId: number, projectId: string | null = null): number {
    const row = getDB()
        .prepare("SELECT COUNT(*) AS n FROM transactions WHERE chain_id = ? AND project_id = ?")
        .get(chainId, scopeId(projectId)) as { n: number };
    return row.n;
}

/** Hash is globally unique — no chainId filter needed. */
export function getTxByHash(hash: string): TxRecord | null {
    return getDB().prepare("SELECT * FROM transactions WHERE lower(hash) = ?").get<TxRecord>(hash.toLowerCase()) ?? null;
}

export function getBlockByNumber(chainId: number, number: number, projectId: string | null = null): BlockRecord | null {
    return getDB()
        .prepare("SELECT * FROM blocks WHERE chain_id = ? AND number = ? AND project_id = ?")
        .get<BlockRecord>(chainId, number, scopeId(projectId)) ?? null;
}

export function getRecentBlocks(chainId: number, limit = 50, offset = 0, projectId: string | null = null): BlockRecord[] {
    return getDB().prepare(`
      SELECT * FROM blocks
       WHERE chain_id = ? AND project_id = ?
       ORDER BY number DESC
       LIMIT ? OFFSET ?
    `).all(chainId, scopeId(projectId), limit, offset) as BlockRecord[];
}

export function saveTxTrace(hash: string, structLogs: unknown, callTrace: unknown) {
    getDB().prepare(`
    INSERT OR REPLACE INTO tx_traces (hash, struct_logs, call_trace, created_at)
    VALUES (?, ?, ?, ?)
  `).run(hash.toLowerCase(), JSON.stringify(structLogs), JSON.stringify(callTrace), Date.now());
}

export function getTxTrace(hash: string) {
    const row = getDB()
        .prepare("SELECT * FROM tx_traces WHERE lower(hash) = ?")
        .get(hash.toLowerCase()) as { struct_logs: string; call_trace: string } | undefined;
    if (!row) return null;
    try {
        return {
            structLogs: JSON.parse(row.struct_logs),
            callTrace: JSON.parse(row.call_trace),
        };
    } catch {
        return null;
    }
}

/** Drop cached traces older than `maxAgeMs` so the DB doesn't grow without bound. */
export function pruneTxTraces(maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
    const res = getDB().prepare("DELETE FROM tx_traces WHERE created_at < ?").run(Date.now() - maxAgeMs);
    return res.changes;
}
