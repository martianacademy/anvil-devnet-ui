# Anvil DevNet — a real block explorer for your local chain

A complete local Ethereum development environment: run [Anvil](https://book.getfoundry.sh/anvil/),
index it with [Blockscout](https://github.com/blockscout/blockscout), and drive the whole thing from
one UI that also does the things an explorer cannot — start and stop the node, fork mainnet, patch
balances and storage, simulate calls, and step through a transaction opcode by opcode.

Think Tenderly, but running entirely on your machine, with your data.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Explorer UI (Blockscout frontend + DevNet pages)      http://localhost:3000 │
│                                                                              │
│  /  /blocks  /txs  /address/…      →  Blockscout backend  (indexed chain)    │
│  /tx/…?tab=evm_trace | gas_profiler | storage_diff  →  DevNet Control API    │
│  /devnet  /devnet/evm  /devnet/patches  /devnet/simulate  /devnet/debugger   │
└──────────────┬──────────────────────────────────────┬────────────────────────┘
               │ /api/v2                              │ /api/devnet/*  (proxied)
               ▼                                      ▼
   Blockscout backend :80                  DevNet Control API :3010
   Postgres · Redis · stats                Next.js · node:sqlite
   sig-provider · visualizer                        │ spawns and drives
               │                                    ▼
               └───────────── indexes ───────►  anvil :8546
```

**This repository is the DevNet Control API** — the headless service that owns the Anvil process,
indexes it into SQLite, serves traces, and exposes an Etherscan-compatible read API. The explorer UI
is Blockscout's frontend with a set of DevNet pages layered on top by `stack/setup.sh`.

---

## Who is this for

| You are… | What this gives you |
| --- | --- |
| **A smart-contract developer** | A real explorer for `anvil` instead of `console.log`. Every transaction gets an opcode trace, a call tree, a gas profile and a storage diff — locally, instantly, with no API key and no rate limit. |
| **Debugging a failing transaction** | The revert banner decodes `Error(string)`, `Panic(code)` and custom errors, and tells you the exact frame, program counter and step where it happened — then hands you a step debugger positioned there. |
| **Optimising gas** | The gas profiler splits a transaction into intrinsic vs execution cost, then breaks execution down by category, opcode, call frame and the individual most expensive steps. |
| **Working against a mainnet fork** | Fork any chain by URL, pin the block automatically, then give your test wallet real ETH and ERC-20 balances with one request — no whale account, no faucet. |
| **A protocol or DeFi engineer** | Time travel, interval mining, impersonation and EVM snapshots let you reproduce time-locked, multi-block and permissioned flows deterministically. |
| **A security researcher / auditor** | Storage-slot writes are shown before → after with mapping keys resolved back to `mapping @ slot N [0xaddr…]`, so you can see exactly which balance or role changed. |
| **A dapp frontend developer** | A local explorer to link users to, plus an Etherscan-compatible API so tools that expect one keep working against your devnet. |
| **Running several environments at once** | Projects: multiple isolated devnets side by side, each with its own port, chain id, fork config, persisted state and indexed history. |
| **Teaching or running workshops** | Everything is visible: mine a block, watch it appear, click a transaction, step through the EVM, see the storage change. No testnet faucets, no waiting. |
| **Building tooling** | A documented HTTP API for every operation — start/stop, patch, simulate, snapshot, trace — so your scripts and CI can drive the chain the same way the UI does. |

---

## Features

### Explorer (from Blockscout)

- Blocks, transactions, addresses, tokens (ERC-20/721/1155), logs and token transfers
- Contract verification, read/write contract UI, search, charts and stats
- Blockscout's REST API v2 at `http://localhost/api/v2`

### Transaction debugging (added by this project)

| Tab | What it shows |
| --- | --- |
| **EVM trace** | Every call, storage read/write and event in execution order, indented by call depth, with gas per operation. Filters for gas / full opcode trace / storage / events, free-text search, and rows that expand to the full untruncated values with copy buttons. |
| **Gas profiler** | Gas used vs intrinsic (21,000 + calldata) vs execution, then execution broken down by category, by opcode, per call frame, and the single costliest steps. |
| **Storage diff** | Net before → after for every slot the transaction changed, grouped by contract, with mapping slots resolved to `mapping @ slot N [0xaddr…]`. |
| **Revert banner** | Decoded revert reason — `Error(string)`, `Panic(code)` with its documented meaning, or a custom error matched against the ABI — plus the frame, pc and step, and the raw revert data. |
| **Calldata panel** | Decoded parameters when an ABI is known; a 32-byte word view with a per-word reading (address / uint / offset) when it is not. |
| **Step debugger** | `/devnet/debugger` — walk the opcode trace with stack, memory and storage at each step, jump straight to any SSTORE, and inspect the call tree. |

### DevNet control plane

| Page | What you can do |
| --- | --- |
| `/devnet` | Start, stop and reset the node; set chain id, port, block time, accounts, balance; fork any chain by URL with the block pinned automatically; live process logs |
| `/devnet/evm` | Mine on demand, interval mining, automine toggle, time travel by preset or seconds, account impersonation, EVM snapshots and revert |
| `/devnet/patches` | Set native ETH balances, set ERC-20 balances (slot auto-detected, minimal ERC-20 injected when the address has no code), read and write raw storage slots |
| `/devnet/simulate` | Dry-run any call inside an EVM snapshot that is always reverted — return data, gas estimate, storage writes and decoded events, with zero effect on chain state |
| `/devnet/projects` | Create, start, stop and delete isolated devnets, each with its own port, chain, fork settings and history |

### API

- **Etherscan/BSCScan-compatible** read API — point Foundry, Hardhat or any explorer-aware tool at it
- **JSON-RPC proxy** so the browser never needs the node's port
- **Server-sent events** stream of blocks and transactions, with chain-reset detection
- **Trace API** serving `debug_traceTransaction` (opcodes + call tree), cached in SQLite

---

## Requirements

- **Docker** — Blockscout runs as ~10 containers; give Docker Desktop about 8 GB
- **Node.js ≥ 22.5** — persistence uses the built-in `node:sqlite`, so there is no native module to compile
- **Bun ≥ 1.3** and **pnpm ≥ 9**
- **Foundry** — `anvil` on your `$PATH` ([install guide](https://book.getfoundry.sh/getting-started/installation))

---

## Quick start

```bash
git clone https://github.com/martianacademy/anvil-devnet-ui.git
cd anvil-devnet-ui

bun install          # control API dependencies
./stack/setup.sh     # fetch Blockscout + build the explorer with the DevNet pages
./devnet.sh up       # start anvil, Blockscout, the control API and the UI
```

Open **http://localhost:3000**. First boot pulls a few GB of images and runs database migrations, so
give it a couple of minutes; later starts take seconds.

`stack/setup.sh` clones `blockscout/blockscout` (sparse — just the compose files) and
`blockscout/frontend` next to this repository, copies the DevNet pages from `stack/explorer-overlay`
into the frontend, applies a small patch to four upstream files (navigation, page metadata, analytics
page types, transaction tabs) and installs dependencies. Blockscout's own code is never vendored
here — see [Licence and attribution](#licence-and-attribution).

### Everyday commands

```bash
./devnet.sh up       # start everything (safe to run when parts are already up)
./devnet.sh status   # what is running
./devnet.sh logs     # tail anvil + control API + UI logs
./devnet.sh down     # stop the UI, the control API and the containers
./devnet.sh reset    # wipe the index and the devnet state, then start fresh
```

`reset` matters: Blockscout indexes by block height, so when Anvil restarts at block 0 the indexer
would keep serving the old chain. `reset` clears the control API's tables, drops the Blockscout
volumes and reindexes from scratch.

### Where things live

| URL | What |
| --- | --- |
| http://localhost:3000 | Explorer UI |
| http://localhost:3000/devnet | DevNet control pages |
| http://localhost/api/v2 | Blockscout REST API |
| http://localhost:3010/api | DevNet Control API (this repo) |
| http://localhost:3010/api/explorer | Etherscan-compatible read API |
| http://127.0.0.1:8546 | The devnet JSON-RPC endpoint |

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVNET_API_PORT` | `3010` | Port the control API listens on |
| `DEVNET_RPC_PORT` | `8546` | Anvil port to manage and index when no project is running |
| `DEVNET_CHAIN_ID` | `31337` | Chain id assumed before a node is started |
| `DEVNET_WORKSPACE` | parent of this repo | Where `blockscout/` and `blockscout-frontend/` are cloned |
| `DEVNET_DB_PATH` | `./devnet.db` | Move the SQLite file elsewhere |
| `ETHERSCAN_API_KEY` | — | Enables ABI auto-fetch from Etherscan V2 (multichain). Sourcify needs no key |

Explorer UI settings (network name, currency, API host) live in `blockscout-frontend/.env.local`,
generated by `stack/setup.sh`.

---

## Scripts

```bash
bun dev                 # control API in watch mode (DEVNET_API_PORT, default 3010)
bun run build           # production build
bun start               # serve the production build
bun run typecheck       # tsc --noEmit
bun run lint            # eslint
bun run test            # node --test (unit tests in tests/)
bun run check           # typecheck + lint + test
bun run db:reset        # delete devnet.db and its WAL sidecars
bun run db:reset --all  # …and the persisted Anvil state dumps + logs
```

Tests run on Node's built-in runner with native TypeScript support — no build step and no test
framework dependency. They cover the pure layers: formatting, input validation, indexer mapping,
Anvil argument construction, storage-slot derivation, the SQLite schema and migrations, and project
resolution.

---

## How it fits together

**Blockscout does the reading.** Its official `anvil.yml` preset points the indexer at
`host.docker.internal`, so the devnet must listen on `0.0.0.0` — the control API always starts Anvil
that way. `stack/docker-compose/devnet.override.yml` moves it to port 8546 (8545 is usually taken by
a hand-started node bound to localhost), disables Ecto's SSL because the bundled Postgres does not
speak TLS, and sets the chain id and frontend network config.

**The control API does the writing.** Blockscout is read-only, and its Anvil preset disables the
internal-transaction fetcher, so call traces, opcode traces, state patching and process control all
come from here instead.

**Every request resolves its target node** in one place: an explicit project (`?projectId=` or the
`x-project-id` header) → a live in-process instance → a project row marked running → the configured
default. That is what lets several devnets run side by side without any route hard-coding a port.

### Design notes worth knowing

- **Anvil prefixes every memory word with `0x`**, geth does not. Joining those words without
  stripping the prefix shifts every byte offset, which silently corrupts decoded log data and
  calldata. The trace builder strips first.
- **An opcode trace starts inside the callee**, so the transaction's own call has no opcode of its
  own. The transaction is fetched alongside the trace and synthesised as the root row.
- **A call opcode's `gasCost` includes the gas it forwards**, so charging it whole would double
  count. The profiler charges the caller only `gasCost − (gas at the callee's first step)` and lets
  the callee's opcodes account for the rest — on a simple ERC-20 transfer, intrinsic + execution then
  equals the receipt's `gasUsed` exactly.
- **Mapping slots are recoverable.** Solidity stores `mapping[key]` at
  `keccak256(pad32(key) ++ pad32(slot))`, so replaying that for every address the transaction touched
  turns an opaque storage hash into a readable label.
- **Blocks are keyed by `(chain_id, project_id, number)`**, so two projects on the same chain id do
  not overwrite each other's history.
- **Persistence uses `node:sqlite`.** The project used to depend on `better-sqlite3`, whose native
  binding breaks whenever Node's ABI changes and needs a compiler to recover. The built-in module has
  nothing to build.

---

## API reference

All routes are under `/api` on the control API (`http://localhost:3010` by default) and return JSON.
Errors are always `{ "error": "…" }` — `400` for invalid input, `404` for missing resources, `503`
when the node is unreachable.

Scope any request to a specific project with `?projectId=…` or the `x-project-id` header.

### Node process

| Method | Route | Body / params | Description |
| --- | --- | --- | --- |
| `POST` | `/api/anvil/start` | `{ chainId, port, blockTime, accounts, balance, baseFee, forkUrl?, forkBlockNumber? }` | Spawn Anvil; the fork block is pinned automatically |
| `POST` | `/api/anvil/stop` | — | SIGTERM, then SIGKILL after 3 s, then free the port |
| `GET` | `/api/anvil/status` | — | `{ running, managed, pid, port, chainId, blockNumber, gasPrice, uptime, lastError, config }` |
| `GET` | `/api/anvil/logs` | `?limit=200` | Recent process output, the log path and the last start error |
| `POST` | `/api/anvil/reset` | `{ chainId? }` | Stop the node, clear indexed rows and delete the persisted state |

```bash
# Local chain
curl -X POST http://localhost:3010/api/anvil/start \
  -H "Content-Type: application/json" \
  -d '{ "chainId": 31337, "port": 8546, "accounts": 10, "balance": 10000 }'

# Fork BSC mainnet
curl -X POST http://localhost:3010/api/anvil/start \
  -H "Content-Type: application/json" \
  -d '{ "chainId": 56, "port": 8546, "forkUrl": "https://bsc-dataseed.binance.org" }'
```

### EVM control

| Method | Route | Body | Description |
| --- | --- | --- | --- |
| `POST` | `/api/anvil/mine` | `{ blocks: 5 }` | Mine N blocks (`anvil_mine`) |
| `POST` | `/api/anvil/time` | `{ action: "increaseTime", value: 86400 }` | Jump forward in time |
| `POST` | `/api/anvil/time` | `{ action: "setNextBlockTimestamp", value: 1767225600 }` | Pin the next block's timestamp |
| `POST` | `/api/anvil/time` | `{ action: "setAutomine", value: false }` | Toggle automining |
| `POST` | `/api/anvil/time` | `{ action: "setIntervalMining", value: 2 }` | Mine every N seconds (0 disables) |
| `POST` | `/api/anvil/impersonate` | `{ action: "start" \| "stop", address }` | Send transactions as any address |
| `GET` | `/api/anvil/snapshot` | — | Snapshots for the active project |
| `POST` | `/api/anvil/snapshot` | `{ label?: "before-deploy" }` | Take a named snapshot |
| `POST` | `/api/anvil/revert` | `{ id: "0x1" }` | Revert to a snapshot (consumes it and any newer ones) |

### State patches

| Method | Route | Body / params | Description |
| --- | --- | --- | --- |
| `POST` | `/api/patches/fund` | `{ type: "native", address, amount }` | Set an ETH balance |
| `POST` | `/api/patches/fund` | `{ type: "erc20", token, address, amount, decimals?, mappingSlot? }` | Set an ERC-20 balance |
| `GET` | `/api/patches/storage` | `?contract=0x…&slot=0x0` | Read a storage slot |
| `POST` | `/api/patches/storage` | `{ contract, slot, value }` | Write a storage slot |
| `GET` / `POST` | `/api/patches/scripts` | `{ action: "save" \| "run" \| "delete", … }` | Save and replay batches of patches |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/patches/profiles` | `{ name, chainId, forkUrl, … }` | Saved fork profiles (presets: Ethereum, BSC, opBNB, local) |

```bash
# 1,000 ETH for a test wallet
curl -X POST http://localhost:3010/api/patches/fund \
  -H "Content-Type: application/json" \
  -d '{ "type": "native", "address": "0xYourAddress", "amount": "1000" }'

# 50,000 USDT — the balances slot is detected automatically
curl -X POST http://localhost:3010/api/patches/fund \
  -H "Content-Type: application/json" \
  -d '{ "type": "erc20", "token": "0x55d398326f99059fF775485246999027B3197955", "address": "0xYourAddress", "amount": "50000" }'
```

### Transactions and traces

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/tx/{hash}` | Transaction from the index, falling back to the node |
| `GET` | `/api/tx/{hash}/trace` | `debug_traceTransaction` — opcode trace and call tree, cached in SQLite |
| `POST` | `/api/simulate` | Dry-run a call inside a snapshot that is always reverted |
| `POST` | `/api/abi/batch` | Resolve ABIs for up to 100 addresses (local → Sourcify → Etherscan V2) |

### Contracts, tokens, projects

| Method | Route | Description |
| --- | --- | --- |
| `GET` / `POST` | `/api/contracts` | List or register a contract ABI (and source) |
| `GET` / `DELETE` | `/api/contracts/{address}` | Fetch one (auto-resolving from Sourcify/Etherscan) or remove it |
| `GET` / `POST` / `DELETE` | `/api/tokens` | ERC-20 watchlist; metadata is read on-chain when you add one |
| `GET` | `/api/tokens/balances` | Every watched balance in one batched RPC call |
| `GET` / `POST` | `/api/projects` | List or create isolated devnets |
| `GET` / `PATCH` / `DELETE` | `/api/projects/{id}` | Read, edit (while stopped) or delete a project and all its data |
| `POST` | `/api/projects/{id}/start` \| `/stop` | Control that project's node |

### Etherscan-compatible explorer API

`GET /api/explorer` mirrors the Etherscan/BSCScan surface, so tools that expect one work against your
devnet:

```
module=account     action=balance | balancemulti | txlist | txlistinternal | tokentx | tokenbalance | listaccounts
module=contract    action=getabi | getsourcecode
module=transaction action=gettxreceiptstatus | getstatus
module=block       action=getblocklist | getblocknobytime
module=tx          action=getrecentlist
module=logs        action=getLogs
module=proxy       action=<any eth_* method>
```

```toml
# foundry.toml
[etherscan]
local = { key = "any", url = "http://localhost:3010/api/explorer" }
```

### JSON-RPC proxy and live stream

```bash
curl -X POST http://localhost:3010/api/rpc \
  -H "Content-Type: application/json" \
  -d '{ "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1 }'
```

```javascript
const es = new EventSource("http://localhost:3010/api/stream");
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type === "block") console.log("block", event.number);
  if (event.type === "tx") console.log("tx", event.hash, event.decodedFunction);
  if (event.type === "reset") console.log("chain reset — drop cached state");
};
```

Event types: `status` (chain, port, project), `block`, `tx`, and `reset` when the node restarts or
the chain is wiped.

---

## Project layout

```
anvil-devnet-ui/
├── app/
│   ├── page.tsx                  # API signpost — the UI lives in the explorer
│   └── api/                      # every route above
├── lib/
│   ├── db.ts                     # schema + migrations (WAL, 11 tables)
│   ├── sqlite.ts                 # node:sqlite adapter with a statement cache
│   ├── anvilProcess.ts           # spawn / stop / orphan cleanup
│   ├── activeProject.ts          # which node does this request target?
│   ├── indexer.ts                # RPC block/tx → DB row mapping
│   ├── txStore.ts                # block / tx / trace persistence
│   ├── abiRegistry.ts            # ABI storage, decoding, Sourcify + Etherscan V2
│   ├── patcher.ts                # fund native, fund ERC-20, write storage
│   ├── tokenBalances.ts          # balances, slot detection, mock ERC-20 injection
│   ├── projectStore.ts           # project CRUD + cascade delete
│   ├── validate.ts / route.ts    # input validation and uniform error handling
│   └── rpc.ts                    # viem client + rpc()/rpcBatch()
├── stack/
│   ├── setup.sh                  # fetch Blockscout, apply the DevNet overlay
│   ├── docker-compose/           # devnet.override.yml for Blockscout's anvil preset
│   └── explorer-overlay/         # the DevNet UI (our code) + upstream.patch
├── tests/                        # node --test unit tests
├── scripts/resetDb.ts
└── devnet.sh                     # start / stop / reset the whole stack
```

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/api` returns **502** from the explorer | nginx caches the backend's IP at boot; a backend restart leaves it stale. `docker restart proxy` (`devnet.sh up` does this automatically). |
| Backend crash-loops with **“ssl not available”** | The bundled Postgres has no TLS. `ECTO_USE_SSL=false` is set in `devnet.override.yml` — make sure the override is actually passed. |
| Blockscout shows **blocks that no longer exist** | Anvil restarted at block 0 while the index kept the old chain. Run `./devnet.sh reset`. |
| The indexer never sees the chain | Anvil must listen on `0.0.0.0`, otherwise the containers cannot reach it through `host.docker.internal`. Start it via `devnet.sh` or the control API. |
| `pnpm install` fails building **node-datachannel** | A transitive WebRTC dependency compiles native code. Install with `--ignore-scripts` (what `stack/setup.sh` does); nothing needs it at runtime. |
| `pnpm dev:local` fails on **`git describe`** | The frontend clone has no tags. `git tag devnet-fork-base` inside it (also done by `stack/setup.sh`). |
| **“Cannot find module node:sqlite”** | Node is older than 22.5. Upgrade Node — Bun does not implement `node:sqlite`, but `next dev`/`next build` run under Node anyway. |
| The trace tab says **tracing unavailable** | The node was started without `--steps-tracing`, or you are on a fork whose RPC blocks `debug_traceTransaction`. |

---

## Licence and attribution

> **Note:** this repository does not carry a licence file yet, which means default copyright applies
> and others cannot legally reuse it. Add one (MIT is the usual choice for developer tooling) if you
> want contributions and forks.

The explorer is [Blockscout](https://github.com/blockscout/blockscout), which is distributed under
its own licence (`LicenseRef-Blockscout`). That licence is non-transferable and non-sublicensable, so
**Blockscout's source is not vendored here** — `stack/setup.sh` fetches it from Blockscout directly
and applies our overlay locally. Blockscout's branding and footer attribution are left intact, as its
licence requires. Read their licence before deploying anything based on it.

Built with [Foundry](https://github.com/foundry-rs/foundry) (Anvil), [viem](https://viem.sh),
[Next.js](https://nextjs.org) and [Blockscout](https://blockscout.com).
