// SPDX-License-Identifier: LicenseRef-Blockscout

/** What Anvil is actually running with — read off the node itself where possible. */
export interface NodeConfig {
  chainId?: number;
  port?: number;

  /** Null when the node mines on demand rather than on a fixed interval. */
  blockTime?: number | null;
  accounts?: number;
  balance?: number | null;
  baseFee?: number | null;
  forkUrl?: string;
  forkBlockNumber?: number;
}

export interface NodeStatus {
  running: boolean;
  managed: boolean;
  pid: number | null;
  port: number;
  chainId: number | null;
  blockNumber: number;
  gasPrice: string | null;
  lanIp: string | null;
  rpcUrl: string;
  uptime: number;
  projectId: string | null;
  lastError: string | null;
  config: NodeConfig | null;

  /** 'node' when the config was read from the live node, 'managed' when only this app's memory of it. */
  configSource?: 'node' | 'managed' | null;
  explorer?: {

    /** Port the Blockscout indexer is watching. */
    rpcPort: number;
    chainId: number;

    /** False when the running node is on a port the indexer ignores. */
    indexed: boolean;

    /** Progress of the automatic reindex triggered by a node start or reset. */
    sync?: {
      status: 'idle' | 'syncing' | 'ready' | 'error' | 'unavailable';
      chainId: number | null;
      port: number | null;
      message: string | null;
      startedAt: number | null;
      finishedAt: number | null;
    };
  };
}

export interface StartNodeParams {
  chainId: number;
  port: number;
  blockTime: number;
  accounts: number;
  balance: number;
  baseFee: number;
  forkUrl?: string;
  forkBlockNumber?: number;
}

export interface Project {
  id: string;
  name: string;
  chain_id: number;
  fork_url: string | null;
  fork_block: number | null;
  port: number;
  status: string;
  created_at: number;
  isRunning: boolean;
  rpcUrl: string;
}

export interface Snapshot {
  id: string;
  label: string;
  block_number: number;
  created_at: number;
}

export interface SimulationResult {
  success: boolean;
  error: string | null;
  reverted?: boolean;
  gasEstimate: string | null;
  gasUsed: string | null;
  returnData: string | null;
  sstores: Array<{ slot: string; value: string }>;
  events: Array<{
    address?: string;
    topics?: Array<string>;
    contractName?: string | null;
    eventName?: string | null;
    args?: Record<string, unknown> | null;
  }>;
}

export interface AccountRow {
  address: string;
  balance: string;
  nonce: number;
}
