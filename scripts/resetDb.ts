/**
 * Delete the local SQLite database (and its WAL sidecars) plus the Anvil
 * runtime files this app writes. Run with: `bun run db:reset`.
 */
import { existsSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dbPath = process.env.DEVNET_DB_PATH ?? join(process.cwd(), "devnet.db");
const runtimeDir = join(tmpdir(), "anvil-devnet-ui");

for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(file)) {
        unlinkSync(file);
        console.log(`Deleted: ${file}`);
    }
}

if (process.argv.includes("--all") && existsSync(runtimeDir)) {
    rmSync(runtimeDir, { recursive: true, force: true });
    console.log(`Deleted: ${runtimeDir} (anvil state dumps + logs)`);
}

console.log("Database reset complete.");
if (!process.argv.includes("--all")) {
    console.log("Tip: pass --all to also drop persisted Anvil state and logs.");
}
