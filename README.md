# Anvil DevNet Control API

The headless control plane for a local [Anvil](https://book.getfoundry.sh/anvil/) devnet:
process control, EVM manipulation, state patches, call simulation, multi-project devnets,
and an Etherscan-compatible read API over its own SQLite index.

**There is no UI in this package.** It lives in the Blockscout frontend fork under
`/devnet` — see [`../README.md`](../README.md) for the full stack, or run `../devnet.sh up`.

```
Blockscout frontend fork  :3000   ── /devnet/*  ──►  this API  :3010  ──►  anvil  :8546
        │                                                                     ▲
        └── blocks / txs / addresses ──► Blockscout backend :80 ──────────────┘
```

Built with **Next.js 16**, **viem**, and **SQLite** via Node's built-in `node:sqlite`
(no native modules to compile). All state is local, all data is yours.

---

## Features

| Feature                     | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| **Process Control**         | Start / stop Anvil with full config (port, chain ID, fork URL, block time)              |
| **Live Indexer**            | SSE-powered block/transaction stream, persisted to SQLite                               |
| **Trace API**               | `debug_traceTransaction` output (opcodes + call tree) for the devnet debugger           |
| **ABI Registry**            | Upload ABI + source, or auto-fetch from Sourcify / Etherscan V2                         |
| **EVM Control**             | Time travel, manual mining, impersonation, zero-gas mode, interval mining               |
| **State Patches**           | Fund native ETH, fund ERC-20 tokens, read/write arbitrary storage slots                 |
| **Chain Profiles**          | Save and switch between fork configs (presets: Ethereum, BSC, opBNB, Local)             |
| **Call Simulator**          | Dry-run a call without touching chain state (snapshot/revert under the hood)            |
| **EVM Snapshots**           | Take/revert named EVM snapshots                                                         |
| **Projects**                | Run several isolated devnets side by side, each with its own port, chain and history    |

---

## Requirements

- **Node.js ≥ 22.5** — persistence uses the built-in `node:sqlite` module, so there is no native
  dependency to compile and nothing to rebuild when you upgrade Node
- **Bun ≥ 1.3** (optional) — used for the scripts below; `npm`/`pnpm` work too
- **Foundry** installed and `anvil` on your `$PATH` — [install guide](https://book.getfoundry.sh/getting-started/installation)

### Optional environment variables

| Variable            | Purpose                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `DEVNET_API_PORT`   | Port this API listens on (default `3010`)                                    |
| `DEVNET_RPC_PORT`   | Anvil port to manage when no project is running (default `8545`)             |
| `DEVNET_CHAIN_ID`   | Chain id assumed before a node is started (default `31337`)                  |
| `ETHERSCAN_API_KEY` | Enables ABI auto-fetch from Etherscan V2 (multichain). Sourcify needs no key |
| `DEVNET_DB_PATH`    | Move the SQLite file somewhere other than `./devnet.db`                      |

---

## Quick Start

```bash
cd anvil-devnet-ui
bun install

# Headless API on :3010, managing an anvil on :8546
DEVNET_API_PORT=3010 DEVNET_RPC_PORT=8546 bun dev
```

Then open the explorer UI at [http://localhost:3000/devnet](http://localhost:3000/devnet), or drive
the API directly:

```bash
curl -X POST http://localhost:3010/api/anvil/start \
  -H "Content-Type: application/json" \
  -d '{ "port": 8546, "chainId": 31337, "accounts": 10, "balance": 10000 }'
```

To bring up the whole stack (Blockscout + this API + the explorer UI) in one go, use
`../devnet.sh up` from the workspace root.

---

## Project Structure

```
anvil-devnet-ui/
├── app/
│   ├── page.tsx                  # API signpost (no UI — see the Blockscout fork)
│   ├── layout.tsx                # Minimal root layout
│   └── api/                      # All API routes
│       ├── anvil/                # start / stop / status / snapshot / mine / time …
│       ├── explorer/             # Etherscan-compatible REST API
│       ├── tx/[hash]/            # Transaction + debug trace (feeds the debugger)
│       ├── contracts/            # ABI registry CRUD
│       ├── patches/              # fund / storage / profiles / scripts
│       ├── tokens/               # ERC-20 watchlist
│       ├── simulate/             # call dry-run
│       ├── projects/             # Multi-devnet CRUD + start/stop
│       ├── stream/               # SSE live feed
│       └── rpc/                  # Raw JSON-RPC proxy
├── lib/
│   ├── db.ts                     # Schema + migrations (WAL mode, 11 tables)
│   ├── sqlite.ts                 # Thin node:sqlite adapter (prepared-statement cache)
│   ├── rpc.ts                    # viem publicClient + rpc()/rpcBatch() helpers
│   ├── anvilProcess.ts           # Spawn / kill anvil process
│   ├── txStore.ts                # Block / tx / trace persistence
│   ├── abiRegistry.ts            # ABI storage, decode, Sourcify fetch
│   ├── patcher.ts                # fundNative, fundERC20, writeStorage
│   ├── tokenBalances.ts          # ERC-20 balance fetcher + slot detect
│   ├── chainProfiles.ts          # Fork profile save/load
│   ├── projectStore.ts           # Project CRUD + cascade delete
│   ├── activeProject.ts          # Which node does this request target?
│   ├── indexer.ts                # RPC block/tx → DB row mapping
│   ├── validate.ts               # Input validators (400 instead of 500)
│   └── route.ts                  # Uniform route error handling
├── tests/                        # node --test unit tests
└── scripts/
    └── resetDb.ts                # Wipe SQLite database (and, with --all, Anvil state)
```

---

## npm / bun Scripts

```bash
bun dev                 # Start dev server (http://localhost:3000)
bun run build           # Production build
bun start               # Serve production build
bun run typecheck       # tsc --noEmit
bun run lint            # eslint
bun run test            # node --test (unit tests in tests/)
bun run check           # typecheck + lint + test
bun run db:reset        # Delete devnet.db and its WAL sidecars
bun run db:reset --all  # …and the persisted Anvil state dumps + logs
```

Tests run on Node's built-in runner with native TypeScript support — no build step, no test framework
dependency. They cover the pure layers: formatting, input validation, indexer mapping, Anvil argument
construction, storage-slot derivation, the SQLite schema/migration, and project resolution.

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
| `POST` | `/api/anvil/time`        | `{ action: "increaseTime", value: 86400 }`     | Jump forward in time    |
| `POST` | `/api/anvil/time`        | `{ action: "setAutomine", value: false }`      | Toggle automining       |
| `POST` | `/api/anvil/time`        | `{ action: "setIntervalMining", value: 2 }`    | Mine every N seconds    |
| `POST` | `/api/anvil/impersonate` | `{ action: "start", address: "0x…" }`          | Impersonate any address |
| `GET`  | `/api/anvil/snapshot`    | —                                              | List snapshots for the active project |
| `POST` | `/api/anvil/snapshot`    | `{ label: "before-deploy" }`                   | Take a named snapshot   |
| `POST` | `/api/anvil/revert`      | `{ id: "0x1" }`                                | Revert to snapshot (consumes it and any newer ones) |

```bash
# Mine 10 blocks
curl -X POST http://localhost:3000/api/anvil/mine \
  -H "Content-Type: application/json" \
  -d '{ "blocks": 10 }'

# Jump forward 30 days
curl -X POST http://localhost:3000/api/anvil/time \
  -H "Content-Type: application/json" \
  -d '{ "action": "increaseTime", "value": 2592000 }'

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
| `GET`  | `/api/patches/storage` | `?contract=0x…&slot=0x0`                    | Read a storage slot                 |
| `POST` | `/api/patches/storage` | `{ contract, slot, value }`                 | Write a storage slot                |

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
  -d '{ "contract": "0xContract", "slot": "0x0", "value": "0x0000000000000000000000000000000000000000000000000000000000000001" }'
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
| `GET`    | `/api/tokens`          | —                                                  | List watchlist                    |
| `POST`   | `/api/tokens`          | `{ token_address, wallet_address, token_type? }`   | Add to watchlist (metadata auto-read on-chain) |
| `DELETE` | `/api/tokens`          | `{ id }`                                           | Remove from watchlist             |
| `GET`    | `/api/tokens/balances` | —                                                  | Fetch all balances in one batched RPC call |

```bash
# Watch WBNB balance of an address
curl -X POST http://localhost:3000/api/tokens \
  -H "Content-Type: application/json" \
  -d '{ "token_address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "wallet_address": "0xYourAddress" }'
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

Response includes `success`, `error`, `gasEstimate`, `gasUsed`, `returnData`, `sstores`, and decoded
`events`. The call runs inside an EVM snapshot that is always reverted, so chain state is untouched.

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

Auto-fetch from **Sourcify** is supported — click "Fetch ABI" on any contract detail page. Set
`ETHERSCAN_API_KEY` to also fall back to the Etherscan V2 multichain API.

---

### Projects (multiple devnets at once)

Each project is an isolated devnet: its own port, chain id, fork settings, Anvil process, persisted
state file and indexed history. Create and control them from `/projects`.

| Method   | Route                        | Body                                       | Description                          |
| -------- | ---------------------------- | ------------------------------------------ | ------------------------------------ |
| `GET`    | `/api/projects`              | —                                          | List projects (status reconciled with live processes) |
| `POST`   | `/api/projects`              | `{ name, chainId, forkUrl?, port? }`       | Create a project (port auto-assigned) |
| `GET`    | `/api/projects/[id]`         | —                                          | Read one project                     |
| `PATCH`  | `/api/projects/[id]`         | `{ name?, chainId?, forkUrl?, port? }`     | Edit a stopped project               |
| `DELETE` | `/api/projects/[id]`         | —                                          | Stop, then delete the project and all its data |
| `POST`   | `/api/projects/[id]/start`   | —                                          | Spawn this project's Anvil instance  |
| `POST`   | `/api/projects/[id]/stop`    | —                                          | Stop it and free the port            |

Every other API route resolves its target node in this order: an explicit project → a live in-process
instance → a project row marked running → the default `8545` node. To pin a request to one project,
send `?projectId=…` or the `x-project-id` header — the web UI does this automatically for the
project you select.

```bash
# Create and start a BSC fork on its own port
ID=$(curl -s -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{ "name": "bsc-fork", "chainId": 56, "forkUrl": "https://bsc-dataseed.binance.org" }' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["project"]["id"])')

curl -X POST "http://localhost:3000/api/projects/$ID/start"
curl "http://localhost:3000/api/anvil/status?projectId=$ID"
```

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
  const event = JSON.parse(e.data);
  if (event.type === "block") console.log("New block:", event.number);
  if (event.type === "tx") console.log("New tx:", event.hash);
  if (event.type === "reset") console.log("Chain reset — clear your cache");
};
```

Event types: `status` (current chain/port/project), `block`, `tx`, and `reset` (emitted when the node
restarts or the chain is reset, so clients can drop stale state).

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
| UI         | none — served by the Blockscout frontend fork |
| RPC Client | viem v2                               |
| Database   | `node:sqlite` (WAL mode, no native build) |
| Realtime   | Server-Sent Events (SSE)              |
| Process    | Node.js `child_process.spawn`         |
| Runtime    | Node ≥ 22.5 (scripts via Bun ≥ 1.3)   |

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
