import Database from "better-sqlite3";
import path from "path";

let _db: Database.Database | null = null;

export function getDB(): Database.Database {
    if (_db) return _db;

    _db = new Database(path.join(process.cwd(), "devnet.db"));

    // WAL mode: allows concurrent readers + 1 writer without "SQLITE_BUSY"
    _db.pragma("journal_mode = WAL");

    // If a write is locked, retry for up to 5 seconds before throwing
    _db.pragma("busy_timeout = 5000");

    // Performance tuning
    _db.pragma("synchronous = NORMAL");
    _db.pragma("cache_size = -32000");
    _db.pragma("foreign_keys = ON");

    migrate(_db);
    return _db;
}

function upgradeChainId(db: Database.Database) {
    // Upgrade blocks table: old schema has number as sole PK, new needs (chain_id, number)
    const blockCols = (db.prepare("PRAGMA table_info(blocks)").all() as any[]).map((c: any) => c.name);
    if (!blockCols.includes("chain_id")) {
        db.exec(`
            ALTER TABLE blocks RENAME TO blocks_legacy;
            CREATE TABLE blocks (
                chain_id INTEGER NOT NULL DEFAULT 31337,
                number   INTEGER NOT NULL,
                hash     TEXT NOT NULL,
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

    // Upgrade transactions table: add chain_id column if missing
    const txCols = (db.prepare("PRAGMA table_info(transactions)").all() as any[]).map((c: any) => c.name);
    if (!txCols.includes("chain_id")) {
        db.exec(`ALTER TABLE transactions ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 31337`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tx_chain ON transactions(chain_id)`);
    }
}

function migrate(db: Database.Database) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      chain_id  INTEGER NOT NULL DEFAULT 31337,
      number    INTEGER NOT NULL,
      hash      TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      tx_count  INTEGER NOT NULL,
      gas_used  TEXT,
      gas_limit TEXT,
      PRIMARY KEY (chain_id, number)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      hash           TEXT PRIMARY KEY,
      chain_id       INTEGER NOT NULL DEFAULT 31337,
      block_number   INTEGER NOT NULL,
      block_timestamp INTEGER NOT NULL,
      from_address   TEXT NOT NULL,
      to_address     TEXT,
      value          TEXT NOT NULL,
      input          TEXT,
      gas            TEXT,
      gas_used       TEXT,
      gas_price      TEXT,
      nonce          INTEGER,
      status         INTEGER,
      revert_reason  TEXT,
      decoded_function TEXT,
      decoded_params TEXT
    );

    CREATE TABLE IF NOT EXISTS contracts (
      address TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      abi TEXT NOT NULL,
      source TEXT,
      verified_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      address TEXT PRIMARY KEY,
      label TEXT
    );

    CREATE TABLE IF NOT EXISTS tx_traces (
      hash TEXT PRIMARY KEY,
      struct_logs TEXT NOT NULL,
      call_trace TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      block_number INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      token_name TEXT,
      token_symbol TEXT,
      token_decimals INTEGER DEFAULT 18,
      token_type TEXT DEFAULT 'ERC20',
      added_at INTEGER NOT NULL,
      UNIQUE(token_address, wallet_address)
    );

    CREATE TABLE IF NOT EXISTS chain_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      config TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      target_address TEXT NOT NULL,
      payload TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS patch_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      ops TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tx_from  ON transactions(from_address);
    CREATE INDEX IF NOT EXISTS idx_tx_to    ON transactions(to_address);
    CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(block_number);
    CREATE INDEX IF NOT EXISTS idx_tx_chain ON transactions(chain_id);
    CREATE INDEX IF NOT EXISTS idx_blk_chain ON blocks(chain_id);
  `);

    // Upgrade existing DBs that don't have chain_id yet
    upgradeChainId(db);
}
