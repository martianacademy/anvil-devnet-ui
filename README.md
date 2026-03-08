# Anvil DevNet UI

A self-hosted, full-stack local blockchain explorer and EVM debugger — like Tenderly or BuildBear, but for your local [Anvil](https://book.getfoundry.sh/anvil/) node.

Built with **Next.js 16**, **viem**, **SQLite**, **shadcn/ui**, and **Zustand**. All state is local, all data is yours.

---

## Features

| Feature                     | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| **Process Control**         | Start / stop Anvil from the UI with full config (port, chain ID, fork URL, block time) |
| **Live Transaction Stream** | SSE-powered real-time transaction feed, persisted to SQLite                            |
| **EVM Debugger**            | Step through opcodes with stack, memory, and storage panels                            |
| **Call Tree**               | Visualise nested CALL / DELEGATECALL / STATICCALL traces                               |
| **Storage Diff**            | Before/after view of every SSTORE in a transaction                                     |
| **ABI Registry**            | Upload ABI + source, or auto-fetch from Sourcify                                       |
| **Block Explorer**          | Browse blocks and transactions with a BSCScan-compatible REST API                      |
| **Accounts**                | List all Anvil accounts with live balances; fund any address in one click              |
| **EVM Control Panel**       | Time travel, manual mining, impersonation, zero-gas mode, interval mining              |
| **State Patches**           | Fund native ETH, fund ERC-20 tokens, read/write arbitrary storage slots                |
| **Chain Profiles**          | Save and switch between fork configs (presets: Ethereum, BSC, opBNB, Local)            |
| **Token Tracker**           | Watch ERC-20 balances across multiple addresses with 3 s auto-refresh                  |
| **Call Simulator**          | Dry-run `eth_call` without touching chain state (snapshot/revert under the hood)       |
| **EVM Snapshots**           | Take/revert named EVM snapshots from the dashboard                                     |

---

## Requirements

- **Node.js** ≥ 20 or **Bun** ≥ 1.3
- **Foundry** installed and `anvil` on your `$PATH` — [install guide](https://book.getfoundry.sh/getting-started/installation)

---

## Quick Start

```bash
# Clone / enter the project
cd anvil-devnet-ui

# Install dependencies
bun install

# Start dev server
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Click **Start Anvil** on the dashboard — the UI will spawn a local node and begin streaming blocks automatically.

---

## Project Structure

```
anvil-devnet-ui/
├── app/
│   ├── page.tsx                  # Dashboard
│   ├── layout.tsx                # Root layout (dark theme, Navbar)
│   ├── tx/[hash]/page.tsx        # Transaction detail + EVM debugger
│   ├── blocks/page.tsx           # Block explorer
│   ├── contracts/page.tsx        # ABI registry
│   ├── contracts/[address]/      # Contract detail (ABI / Txs / Source)
│   ├── accounts/page.tsx         # Account list + fund form
│   ├── evm/page.tsx              # EVM control panel
│   ├── patches/page.tsx          # State patches + chain profiles
│   ├── tokens/page.tsx           # ERC-20 token tracker
│   ├── simulate/page.tsx         # Call simulator
│   └── api/                      # All API routes
│       ├── anvil/                # start / stop / status / snapshot …
│       ├── explorer/             # BSCScan-compatible REST API
│       ├── tx/[hash]/            # Transaction + trace
│       ├── contracts/            # ABI registry CRUD
│       ├── patches/              # fund / storage / profiles / scripts
│       ├── tokens/               # ERC-20 watchlist
│       ├── simulate/             # eth_call dry-run
│       ├── stream/               # SSE live feed
│       └── rpc/                  # Raw JSON-RPC proxy
├── components/                   # All UI components
├── lib/
│   ├── db.ts                     # SQLite (WAL mode, 10 tables)
│   ├── rpc.ts                    # viem publicClient + rpc() helper
│   ├── anvilProcess.ts           # Spawn / kill anvil process
│   ├── txStore.ts                # Block / tx / trace persistence
│   ├── abiRegistry.ts            # ABI storage, decode, Sourcify fetch
│   ├── traceParser.ts            # Parse structLogs → EvmStep[], CallNode
│   ├── patcher.ts                # fundNative, fundERC20, writeStorage
│   ├── tokenBalances.ts          # ERC-20 balance fetcher + slot detect
│   ├── chainProfiles.ts          # Fork profile save/load
│   └── decoder.ts                # Decode tx input via ABI
├── store/
│   └── useDevnetStore.ts         # Zustand global state
└── scripts/
    └── resetDb.ts                # Wipe SQLite database
```

---

## npm / bun Scripts

```bash
bun dev          # Start dev server (http://localhost:3000)
bun build        # Production build
bun start        # Serve production build
bun db:reset     # Delete devnet.db and WAL files
```

---

## API Reference

All routes are under `/api`. Every route returns JSON.

### Anvil Process

| Method | Route               | Body / Params                                              | Description                             |
| ------ | ------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `POST` | `/api/anvil/start`  | `{ port, chainId, forkUrl, blockTime, accounts, balance }` | Spawn anvil process                     |
| `POST` | `/api/anvil/stop`   | —                                                          | SIGTERM → SIGKILL after 3 s             |
| `GET`  | `/api/anvil/status` | —                                                          | `{ running, pid, blockNumber, uptime }` |
| `GET`  | `/api/anvil/logs`   | —                                                          | Last 500 log lines from ring buffer     |

```bash
# Start a local node on port 8545, chain 31337
curl -X POST http://localhost:3000/api/anvil/start \
  -H "Content-Type: application/json" \
  -d '{ "port": 8545, "chainId": 31337, "accounts": 10, "balance": 10000 }'

# Fork BSC mainnet
curl -X POST http://localhost:3000/api/anvil/start \
  -H "Content-Type: application/json" \
  -d '{ "port": 8545, "chainId": 56, "forkUrl": "https://bsc-dataseed.binance.org/" }'
```

---

### EVM Control

| Method | Route                    | Body                                           | Description             |
| ------ | ------------------------ | ---------------------------------------------- | ----------------------- |
| `POST` | `/api/anvil/mine`        | `{ blocks: 5 }`                                | Mine N blocks           |
| `POST` | `/api/anvil/time`        | `{ action: "increaseTime", seconds: 86400 }`   | Jump forward in time    |
| `POST` | `/api/anvil/time`        | `{ action: "setAutomine", enabled: false }`    | Toggle automining       |
| `POST` | `/api/anvil/time`        | `{ action: "setIntervalMining", interval: 2 }` | Mine every N seconds    |
| `POST` | `/api/anvil/impersonate` | `{ action: "start", address: "0x…" }`          | Impersonate any address |
| `GET`  | `/api/anvil/snapshot`    | —                                              | List all snapshots      |
| `POST` | `/api/anvil/snapshot`    | `{ label: "before-deploy" }`                   | Take a named snapshot   |
| `POST` | `/api/anvil/revert`      | `{ snapshotId: "0x1" }`                        | Revert to snapshot      |

```bash
# Mine 10 blocks
curl -X POST http://localhost:3000/api/anvil/mine \
  -H "Content-Type: application/json" \
  -d '{ "blocks": 10 }'

# Jump forward 30 days
curl -X POST http://localhost:3000/api/anvil/time \
  -H "Content-Type: application/json" \
  -d '{ "action": "increaseTime", "seconds": 2592000 }'

# Impersonate Binance hot wallet
curl -X POST http://localhost:3000/api/anvil/impersonate \
  -H "Content-Type: application/json" \
  -d '{ "action": "start", "address": "0x28C6c06298d514Db089934071355E5743bf21d60" }'
```

---

### State Patches

| Method | Route                  | Body                                        | Description                         |
| ------ | ---------------------- | ------------------------------------------- | ----------------------------------- |
| `POST` | `/api/patches/fund`    | `{ type: "native", address, amount }`       | Set native ETH balance              |
| `POST` | `/api/patches/fund`    | `{ type: "erc20", token, address, amount }` | Set ERC-20 balance via storage slot |
| `GET`  | `/api/patches/storage` | `?address=0x…&slot=0x0`                     | Read a storage slot                 |
| `POST` | `/api/patches/storage` | `{ address, slot, value }`                  | Write a storage slot                |

```bash
# Give an address 1 000 ETH
curl -X POST http://localhost:3000/api/patches/fund \
  -H "Content-Type: application/json" \
  -d '{ "type": "native", "address": "0xYourAddress", "amount": "1000" }'

# Give an address 50 000 USDT (auto-detects storage slot)
curl -X POST http://localhost:3000/api/patches/fund \
  -H "Content-Type: application/json" \
  -d '{ "type": "erc20", "token": "0x55d398326f99059fF775485246999027B3197955", "address": "0xYourAddress", "amount": "50000" }'

# Write a raw storage slot
curl -X POST http://localhost:3000/api/patches/storage \
  -H "Content-Type: application/json" \
  -d '{ "address": "0xContract", "slot": "0x0", "value": "0x0000000000000000000000000000000000000000000000000000000000000001" }'
```

---

### Chain Profiles

| Method   | Route                   | Body                                          | Description             |
| -------- | ----------------------- | --------------------------------------------- | ----------------------- |
| `GET`    | `/api/patches/profiles` | —                                             | List all saved profiles |
| `POST`   | `/api/patches/profiles` | `{ name, chainId, forkUrl, port, blockTime }` | Save a profile          |
| `PATCH`  | `/api/patches/profiles` | `{ name }`                                    | Set active profile      |
| `DELETE` | `/api/patches/profiles` | `{ name }`                                    | Delete a profile        |

Built-in presets: **Ethereum Mainnet**, **BSC Mainnet**, **opBNB Mainnet**, **Local (no fork)**.

---

### Token Tracker

| Method   | Route                  | Body / Params                          | Description             |
| -------- | ---------------------- | -------------------------------------- | ----------------------- |
| `GET`    | `/api/tokens`          | —                                      | List watchlist          |
| `POST`   | `/api/tokens`          | `{ token, address, symbol, decimals }` | Add to watchlist        |
| `DELETE` | `/api/tokens`          | `{ id }`                               | Remove from watchlist   |
| `GET`    | `/api/tokens/balances` | —                                      | Fetch all balances live |

```bash
# Watch WBNB balance of an address
curl -X POST http://localhost:3000/api/tokens \
  -H "Content-Type: application/json" \
  -d '{ "token": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "address": "0xYourAddress", "symbol": "WBNB", "decimals": 18 }'
```

---

### Call Simulator

```bash
# Dry-run a USDT balanceOf call — zero chain state change
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "from": "0x0000000000000000000000000000000000000001",
    "to": "0x55d398326f99059fF775485246999027B3197955",
    "data": "0x70a08231000000000000000000000000YourAddressPadded",
    "value": "0x0"
  }'
```

Response includes `result`, `storageDiff`, and `logs`.

---

### Contract ABI Registry

| Method   | Route                      | Body                             | Description                   |
| -------- | -------------------------- | -------------------------------- | ----------------------------- |
| `GET`    | `/api/contracts`           | —                                | List all registered contracts |
| `POST`   | `/api/contracts`           | `{ address, name, abi, source }` | Register ABI + source         |
| `GET`    | `/api/contracts/[address]` | —                                | Get single contract           |
| `DELETE` | `/api/contracts/[address]` | —                                | Unregister contract           |

```bash
# Register a contract ABI
curl -X POST http://localhost:3000/api/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0xContractAddress",
    "name": "MyToken",
    "abi": "[{\"type\":\"function\",\"name\":\"balanceOf\",...}]"
  }'
```

Once registered, transaction inputs and events are automatically decoded in the debugger.

Auto-fetch from **Sourcify** is supported — click "Fetch ABI" on any contract detail page.

---

### BSCScan-Compatible Explorer API

The `/api/explorer` endpoint is a drop-in replacement for BSCScan/Etherscan. Point any tool that supports a custom RPC explorer at `http://localhost:3000/api/explorer`.

**Supported modules:**

```
module=account  action=balance            &address=0x…
module=account  action=balancemulti       &address=0x…,0x…
module=account  action=txlist             &address=0x… &startblock=0 &endblock=999999
module=account  action=tokentx            &address=0x… &contractaddress=0x…
module=account  action=tokenbalance       &contractaddress=0x… &address=0x…
module=account  action=listaccounts
module=contract action=getabi             &address=0x…
module=contract action=getsourcecode      &address=0x…
module=transaction action=gettxreceiptstatus  &txhash=0x…
module=transaction action=getstatus       &txhash=0x…
module=block    action=getblocklist       &page=1 &offset=25
module=block    action=getblocknobytime   &timestamp=1700000000 &closest=before
module=logs     action=getLogs            &address=0x… &topic0=0x…
module=proxy    (any eth_ RPC method)
```

```bash
# Get balance of an address
curl "http://localhost:3000/api/explorer?module=account&action=balance&address=0xYourAddress"

# Get all transactions for an address
curl "http://localhost:3000/api/explorer?module=account&action=txlist&address=0xYourAddress&sort=desc"

# Latest 25 blocks
curl "http://localhost:3000/api/explorer?module=block&action=getblocklist&page=1&offset=25"

# Proxy: call eth_blockNumber
curl "http://localhost:3000/api/explorer?module=proxy&action=eth_blockNumber"
```

**Hardhat / Foundry config example:**

```toml
# foundry.toml
[etherscan]
local = { key = "any", url = "http://localhost:3000/api/explorer" }
```

---

### JSON-RPC Proxy

All standard `eth_*` methods are proxied through `/api/rpc`:

```bash
curl -X POST http://localhost:3000/api/rpc \
  -H "Content-Type: application/json" \
  -d '{ "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1 }'
```

---

### Live SSE Stream

Connect to `/api/stream` to receive real-time block and transaction events:

```javascript
const es = new EventSource("http://localhost:3000/api/stream");
es.onmessage = (e) => {
  const { type, data } = JSON.parse(e.data);
  if (type === "block") console.log("New block:", data.number);
  if (type === "tx") console.log("New tx:", data.hash);
};
```

---

## Use Cases

### 1. Debug a Failing Transaction

Deploy your contract locally → send the failing tx → open `/tx/[hash]` → step through opcodes to find the exact revert condition. The Stack, Memory, and Storage panels update at each step.

### 2. Fork Mainnet / BSC and Test Against Real State

Start Anvil with a fork URL. Use the **State Patches** panel to give your test wallet real token balances without needing a whale account. Switch between fork profiles instantly.

### 3. Time-Travel Testing

Use the **EVM Control Panel** to jump forward by days/weeks, disable automining, set a fixed block timestamp, and verify time-locked contracts behave correctly.

### 4. Impersonation Testing

Impersonate any address (exchange hot wallet, DAO multisig, protocol owner) from the UI — no private key needed. Send transactions as that address directly from Foundry scripts.

### 5. ERC-20 Balance Injection

The token patcher auto-detects the balance storage slot for any ERC-20. Call `/api/patches/fund` with `type: "erc20"` to set any balance in one request — works with non-standard slot layouts via brute-force detection (slots 0–9).

### 6. Dry-Run Calls Before Submitting

Use the **Call Simulator** (`/simulate`) to test any `eth_call` and see the return value, emitted events, and storage changes — all without modifying chain state.

### 7. Replace BSCScan in Your Toolchain

Point Hardhat, Foundry, or any dApp that uses a BSCScan-style API at `http://localhost:3000/api/explorer`. The endpoint mirrors the BSCScan v2 API surface.

### 8. Watch Token Flows in Real Time

Add ERC-20 contracts and wallet addresses to the **Token Tracker**. Balances refresh every 3 seconds so you can watch transfers happen live as you interact with contracts.

---

## Tech Stack

| Layer      | Technology                            |
| ---------- | ------------------------------------- |
| Framework  | Next.js 16.1 (App Router, Turbopack)  |
| Language   | TypeScript 5                          |
| UI         | shadcn/ui + Tailwind CSS v4           |
| State      | Zustand v5                            |
| RPC Client | viem v2                               |
| Database   | better-sqlite3 (WAL mode)             |
| Realtime   | Server-Sent Events (SSE)              |
| Process    | Node.js `child_process.spawn`         |
| Runtime    | Bun ≥ 1.3 (also works with Node ≥ 20) |

---

## Database

SQLite database is created automatically at `devnet.db` on first run. Tables:

- `blocks` — mined block headers
- `transactions` — all transactions (indexed by hash, from, to, block)
- `contracts` — ABI registry
- `accounts` — account cache
- `tx_traces` — cached `debug_traceTransaction` results
- `snapshots` — EVM snapshot records
- `token_watchlist` — ERC-20 watch entries
- `chain_profiles` — saved fork configurations
- `patch_history` — log of all state patches applied
- `patch_scripts` — saved reusable patch scripts

Reset the database:

```bash
bun db:reset
```

---

## Environment

No `.env` required. All configuration is managed through the UI and stored in `devnet.db`.

The default Anvil port is **8545**. You can change it from the Start Anvil config panel.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
