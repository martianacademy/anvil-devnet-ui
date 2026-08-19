import path from "path";
import { SqliteDatabase } from "./sqlite.ts";

let _db: SqliteDatabase | null = null;

/** Sentinel used instead of NULL for "no project" so it can live in a primary key. */
export const NO_PROJECT = "";

/** Normalise a project id for DB queries — `null`/`undefined` become the sentinel. */
export function scopeId(projectId?: string | null): string {
    return projectId ?? NO_PROJECT;
}

export function getDB(): SqliteDatabase {
    if (_db) return _db;

    const file = process.env.DEVNET_DB_PATH ?? path.join(process.cwd(), "devnet.db");
    _db = new SqliteDatabase(file);

    // WAL mode: concurrent readers + one writer without SQLITE_BUSY.
    _db.pragma("journal_mode = WAL");
    // Retry a locked write for up to 5s before throwing.
    _db.pragma("busy_timeout = 5000");
    _db.pragma("synchronous = NORMAL");
    _db.pragma("cache_size = -32000");
    _db.pragma("foreign_keys = ON");

    migrate(_db);
    return _db;
}

/** Close the handle (tests, graceful shutdown). Next getDB() reopens. */
export function closeDB() {
    _db?.close();
    _db = null;
}

function tableNames(db: SqliteDatabase): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
}

function columnsOf(db: SqliteDatabase, table: string): { name: string; pk: number }[] {
    return db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[];
}

const PROJECT_SCOPED_TABLES = ["blocks", "transactions", "patch_history", "snapshots", "token_watchlist"];

/** Legacy DBs (pre chain-scoping) had blocks/transactions without chain_id. */
function upgradeChainId(db: SqliteDatabase) {
    const tables = tableNames(db);

    if (tables.includes("blocks")) {
        const cols = columnsOf(db, "blocks").map((c) => c.name);
        if (!cols.includes("chain_id")) {
            db.exec(`
                ALTER TABLE blocks RENAME TO blocks_legacy;
                CREATE TABLE blocks (
                    chain_id  INTEGER NOT NULL DEFAULT 31337,
                    number    INTEGER NOT NULL,
                    hash      TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    tx_count  INTEGER NOT NULL,
                    gas_used  TEXT,
                    gas_limit TEXT,
                    PRIMARY KEY (chain_id, number)
                );
                INSERT OR IGNORE INTO blocks
                    SELECT 31337, number, hash, timestamp, tx_count, gas_used, gas_limit
                    FROM blocks_legacy;
                DROP TABLE blocks_legacy;
            `);
        }
    }

    if (tables.includes("transactions")) {
        const cols = columnsOf(db, "transactions").map((c) => c.name);
        if (!cols.includes("chain_id")) {
            db.exec(`ALTER TABLE transactions ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 31337`);
        }
    }
}

/** Add + backfill project_id on every project-scoped table. */
function upgradeProjectId(db: SqliteDatabase) {
    const tables = tableNames(db);
    for (const table of PROJECT_SCOPED_TABLES) {
        if (!tables.includes(table)) continue;
        const cols = columnsOf(db, table).map((c) => c.name);
        if (!cols.includes("project_id")) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
        } else {
            // Older builds wrote NULL for "no project"; NULL can't participate in a PK
            // and breaks `= ?` filtering, so collapse it onto the sentinel.
            db.prepare(`UPDATE ${table} SET project_id = '' WHERE project_id IS NULL`).run();
        }
    }
}

/**
 * Two projects can run the same chain id on different ports. The old
 * PRIMARY KEY (chain_id, number) made their blocks overwrite each other,
 * so rebuild the table with project_id in the key.
 */
function upgradeBlocksPrimaryKey(db: SqliteDatabase) {
    if (!tableNames(db).includes("blocks")) return;
    const cols = columnsOf(db, "blocks");
    const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    if (pk.length === 3 && pk.includes("project_id")) return;

    db.exec(`
        ALTER TABLE blocks RENAME TO blocks_old;
        CREATE TABLE blocks (
            chain_id   INTEGER NOT NULL DEFAULT 31337,
            project_id TEXT    NOT NULL DEFAULT '',
            number     INTEGER NOT NULL,
            hash       TEXT    NOT NULL,
            timestamp  INTEGER NOT NULL,
            tx_count   INTEGER NOT NULL,
            gas_used   TEXT,
            gas_limit  TEXT,
            PRIMARY KEY (chain_id, project_id, number)
        );
        INSERT OR IGNORE INTO blocks (chain_id, project_id, number, hash, timestamp, tx_count, gas_used, gas_limit)
            SELECT chain_id, COALESCE(project_id, ''), number, hash, timestamp, tx_count, gas_used, gas_limit
            FROM blocks_old;
        DROP TABLE blocks_old;
    `);
}

function migrate(db: SqliteDatabase) {
    // Upgrades run first so existing tables gain new columns before the
    // CREATE TABLE IF NOT EXISTS statements below become no-ops.
    upgradeChainId(db);
    upgradeProjectId(db);

    db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      chain_id   INTEGER NOT NULL DEFAULT 31337,
      fork_url   TEXT,
      fork_block INTEGER,
      port       INTEGER NOT NULL DEFAULT 8545,
      status     TEXT NOT NULL DEFAULT 'stopped',
      config     TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      chain_id   INTEGER NOT NULL DEFAULT 31337,
      project_id TEXT    NOT NULL DEFAULT '',
      number     INTEGER NOT NULL,
      hash       TEXT    NOT NULL,
      timestamp  INTEGER NOT NULL,
      tx_count   INTEGER NOT NULL,
      gas_used   TEXT,
      gas_limit  TEXT,
      PRIMARY KEY (chain_id, project_id, number)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      hash            TEXT PRIMARY KEY,
      chain_id        INTEGER NOT NULL DEFAULT 31337,
      block_number    INTEGER NOT NULL,
      block_timestamp INTEGER NOT NULL,
      from_address    TEXT NOT NULL,
      to_address      TEXT,
      value           TEXT NOT NULL,
      input           TEXT,
      gas             TEXT,
      gas_used        TEXT,
      gas_price       TEXT,
      nonce           INTEGER,
      status          INTEGER,
      revert_reason   TEXT,
      decoded_function TEXT,
      decoded_params  TEXT,
      project_id      TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS contracts (
      address     TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      abi         TEXT NOT NULL,
      source      TEXT,
      verified_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      address TEXT PRIMARY KEY,
      label   TEXT
    );

    CREATE TABLE IF NOT EXISTS tx_traces (
      hash        TEXT PRIMARY KEY,
      struct_logs TEXT NOT NULL,
      call_trace  TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id           TEXT PRIMARY KEY,
      label        TEXT NOT NULL,
      block_number INTEGER,
      created_at   INTEGER NOT NULL,
      project_id   TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS token_watchlist (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address  TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      token_name     TEXT,
      token_symbol   TEXT,
      token_decimals INTEGER DEFAULT 18,
      token_type     TEXT DEFAULT 'ERC20',
      added_at       INTEGER NOT NULL,
      project_id     TEXT NOT NULL DEFAULT '',
      UNIQUE(token_address, wallet_address, project_id)
    );

    CREATE TABLE IF NOT EXISTS chain_profiles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      config     TEXT NOT NULL,
      is_active  INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patch_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      type           TEXT NOT NULL,
      target_address TEXT NOT NULL,
      payload        TEXT NOT NULL,
      applied_at     INTEGER NOT NULL,
      project_id     TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS patch_scripts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      ops        TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

    upgradeBlocksPrimaryKey(db);
    upgradeProjectId(db);

    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tx_from       ON transactions(from_address);
    CREATE INDEX IF NOT EXISTS idx_tx_to         ON transactions(to_address);
    CREATE INDEX IF NOT EXISTS idx_tx_block      ON transactions(block_number);
    CREATE INDEX IF NOT EXISTS idx_tx_scope      ON transactions(chain_id, project_id, block_number DESC);
    CREATE INDEX IF NOT EXISTS idx_blk_scope     ON blocks(chain_id, project_id, number DESC);
    CREATE INDEX IF NOT EXISTS idx_blk_timestamp ON blocks(chain_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_patch_project ON patch_history(project_id);
    CREATE INDEX IF NOT EXISTS idx_snap_project  ON snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_token_project ON token_watchlist(project_id);
    CREATE INDEX IF NOT EXISTS idx_trace_created ON tx_traces(created_at);
  `);
}
