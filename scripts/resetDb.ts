import { unlinkSync, existsSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "devnet.db");
const walPath = dbPath + "-wal";
const shmPath = dbPath + "-shm";

for (const p of [dbPath, walPath, shmPath]) {
    if (existsSync(p)) {
        unlinkSync(p);
        console.log(`Deleted: ${p}`);
    }
}
console.log("Database reset complete.");
