import { getDB } from "./db";

export interface ChainProfile {
    id?: number;
    name: string;
    chainId: number;
    forkUrl?: string;
    forkBlockNumber?: number;
    stateFile?: string;
    patchScriptId?: number;
    blockTime: number;
    baseFee: number;
    port: number;
    accounts: number;
    balance: number;
    is_active?: number;
}

export function saveProfile(profile: ChainProfile): void {
    const db = getDB();
    const config = JSON.stringify(profile);
    db.prepare(`
    INSERT OR REPLACE INTO chain_profiles (name, config, is_active, created_at)
    VALUES (?, ?, 0, ?)
  `).run(profile.name, config, Date.now());
}

export function getProfile(name: string): ChainProfile | null {
    const db = getDB();
    const row = db.prepare("SELECT * FROM chain_profiles WHERE name = ?").get(name) as any;
    if (!row) return null;
    return { ...JSON.parse(row.config), id: row.id, is_active: row.is_active };
}

export function getAllProfiles(): ChainProfile[] {
    const db = getDB();
    const rows = db.prepare("SELECT * FROM chain_profiles ORDER BY created_at DESC").all() as any[];
    return rows.map((r) => ({ ...JSON.parse(r.config), id: r.id, is_active: r.is_active }));
}

export function setActiveProfile(name: string): void {
    const db = getDB();
    db.prepare("UPDATE chain_profiles SET is_active = 0").run();
    db.prepare("UPDATE chain_profiles SET is_active = 1 WHERE name = ?").run(name);
}

export function deleteProfile(name: string): void {
    const db = getDB();
    db.prepare("DELETE FROM chain_profiles WHERE name = ?").run(name);
}

export const PROFILE_PRESETS: Omit<ChainProfile, "id" | "is_active">[] = [
    {
        name: "BSC Mainnet Fork",
        chainId: 56,
        forkUrl: "https://bsc-dataseed.binance.org",
        blockTime: 0,
        baseFee: 0,
        port: 8545,
        accounts: 10,
        balance: 10000,
    },
    {
        name: "opBNB Fork",
        chainId: 204,
        forkUrl: "https://opbnb-mainnet-rpc.bnbchain.org",
        blockTime: 0,
        baseFee: 0,
        port: 8545,
        accounts: 10,
        balance: 10000,
    },
    {
        name: "ETH Mainnet Fork",
        chainId: 1,
        forkUrl: "https://eth.llamarpc.com",
        blockTime: 0,
        baseFee: 0,
        port: 8545,
        accounts: 10,
        balance: 10000,
    },
    {
        name: "Local Clean",
        chainId: 31337,
        blockTime: 2,
        baseFee: 0,
        port: 8545,
        accounts: 10,
        balance: 10000,
    },
];
