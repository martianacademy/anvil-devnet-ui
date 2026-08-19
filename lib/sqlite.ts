import { DatabaseSync, type StatementSync } from "node:sqlite";

/**
 * Thin wrapper over Node's built-in `node:sqlite` (Node >= 22.5).
 *
 * The project used to depend on `better-sqlite3`, whose native binding has to be
 * compiled per Node ABI — it silently breaks whenever the user upgrades Node and
 * needs Xcode/build tools to recover. `node:sqlite` ships with the runtime, so
 * there is nothing to build. The surface below mirrors the small slice of the
 * better-sqlite3 API this app used, so call sites stay unchanged.
 */

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface Statement {
    get<T = Record<string, unknown>>(...params: SqlValue[]): T | undefined;
    all<T = Record<string, unknown>>(...params: SqlValue[]): T[];
    run(...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint };
}

export class SqliteDatabase {
    private readonly db: DatabaseSync;
    /** Prepared statements are reused — re-parsing SQL on every query is the hot cost. */
    private readonly cache = new Map<string, StatementSync>();

    constructor(filename: string) {
        this.db = new DatabaseSync(filename);
    }

    prepare(sql: string): Statement {
        let stmt = this.cache.get(sql);
        if (!stmt) {
            stmt = this.db.prepare(sql);
            this.cache.set(sql, stmt);
        }
        const prepared = stmt;
        return {
            get: <T>(...params: SqlValue[]) => prepared.get(...params) as T | undefined,
            all: <T>(...params: SqlValue[]) => prepared.all(...params) as T[],
            run: (...params: SqlValue[]) => {
                const res = prepared.run(...params);
                return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
            },
        };
    }

    exec(sql: string): void {
        // DDL can invalidate cached statements (e.g. a table rebuild), so drop them.
        this.cache.clear();
        this.db.exec(sql);
    }

    pragma(statement: string): void {
        this.db.exec(`PRAGMA ${statement}`);
    }

    /** Wrap `fn` in a transaction, mirroring better-sqlite3's `db.transaction(fn)()`. */
    transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
        return (...args: Args): R => {
            this.db.exec("BEGIN");
            try {
                const result = fn(...args);
                this.db.exec("COMMIT");
                return result;
            } catch (err) {
                try { this.db.exec("ROLLBACK"); } catch { /* already rolled back */ }
                throw err;
            }
        };
    }

    close(): void {
        this.cache.clear();
        this.db.close();
    }
}
