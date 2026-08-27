# Anvil DevNet — a real block explorer for your local chain

A complete local Ethereum development environment: run [Anvil](https://book.getfoundry.sh/anvil/),
index it with [Blockscout](https://github.com/blockscout/blockscout), and drive the whole thing from
one UI that also does the things an explorer cannot — start and stop the node, put working contract
code at any address, patch balances and storage, simulate calls, and step through a transaction
opcode by opcode.

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
               └───────────── indexes ───────►  anvil (any port)
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
| **Testing against a mainnet token, without a fork** | Run a plain chain on mainnet's chain id and install a working ERC-20 at the token's real address. Your contracts see the address they expect; your explorer stays free of upstream history. |
| **Working with a teammate** | One command serves the explorer and the RPC to everyone on your Wi-Fi, and a read-only switch lets you share it without handing over control of the chain. |
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
| `/devnet` | Start, stop and reset the node; set chain id, port, block time, accounts, balance; fork any chain by URL with the block pinned automatically; live process logs. While a node runs, every field shows what that node is *actually* running with, read off the wire. A process list stops any stray Anvil holding a port, including ones this app did not start. |
| `/devnet/evm` | Mine on demand, interval mining, automine toggle, time travel by preset or seconds, account impersonation, EVM snapshots and revert |
| `/devnet/patches` | Install contract code at any address — the built-in ERC-20, your own creation bytecode, or raw runtime bytecode; set native ETH and ERC-20 balances (slot auto-detected); read and write raw storage slots |
| `/devnet/simulate` | Dry-run any call inside an EVM snapshot that is always reverted — return data, gas estimate, storage writes and decoded events, with zero effect on chain state |
| `/devnet/projects` | Create, start, stop and delete isolated devnets, each with its own port, chain, fork settings and history |

### Sharing and safety

- **`./devnet.sh expose`** serves the explorer and the RPC to everyone on your Wi-Fi — the URLs
  compiled into the explorer bundle are rewritten to your LAN address, which is the part that
  otherwise breaks
- **`DEVNET_READONLY=1`** keeps the explorer, traces, gas profiler and storage diff fully usable
  while refusing node control, state patches and every state-changing RPC method

### A self-configuring explorer

- Change the chain id or the port, restart Anvil, start a node on a port nobody configured —
  Blockscout notices within about ten seconds, wipes its index and reindexes the chain that exists
- No compose files to edit, and no chance of the explorer serving blocks from a chain you deleted

### API

- **Etherscan/BSCScan-compatible** read API — point Foundry, Hardhat or any explorer-aware tool at it
- **JSON-RPC proxy** so the browser never needs the node's port
- **Server-sent events** stream of blocks and transactions, with chain-reset detection
- **Trace API** serving `debug_traceTransaction` (opcodes + call tree), cached in SQLite

---

## Requirements

**Docker alone is enough.** Give Docker Desktop about 8 GB to run the stack — Blockscout is ~10
containers, and the DevNet control API and explorer UI are two more. The one-off build of the
explorer image wants more headroom than that: 12 GB makes it comfortable, and it is the only step
that does.

To run the control API and the explorer as host processes instead (faster edit-reload while hacking
on this project), you also need:

- **Node.js ≥ 22.5** — persistence uses the built-in `node:sqlite`, so there is no native module to compile
- **Bun ≥ 1.3** and **pnpm ≥ 9**
- **Foundry** — `anvil` on your `$PATH` ([install guide](https://book.getfoundry.sh/getting-started/installation))

---

## Quick start

```bash
git clone https://github.com/martianacademy/anvil-devnet-ui.git
cd anvil-devnet-ui

./stack/setup.sh --docker   # fetch Blockscout's compose files
./devnet.sh up --docker     # build the explorer image, then start everything
```

The control API image is pulled from
[`ghcr.io/martianacademy/anvil-devnet-api`](https://github.com/martianacademy/anvil-devnet-ui/pkgs/container/anvil-devnet-api)
(amd64 and arm64) and carries Anvil inside it, so no Foundry install is needed.

The explorer UI image is **built on your machine** and never pulled. That is not a packaging
oversight: it contains a modified Blockscout frontend, and Blockscout's licence forbids distributing
derivative works — see [Licence and attribution](#licence-and-attribution). The first build compiles
their frontend — expect fifteen minutes or so, most of it downloading ~2,900 packages — and produces
a ~1.1 GB image. After that it is cached.

### Running it from source instead

```bash
bun install          # control API dependencies
./stack/setup.sh     # also clones and builds the explorer frontend
./devnet.sh up       # anvil, Blockscout, the control API and the UI as host processes
```

`compose up` only builds an image that is missing, so after changing this repo's own code run
`DEVNET_REBUILD_API=1 ./devnet.sh up --docker` — otherwise the old control API image keeps serving.

Both paths serve the same thing on the same ports. The difference is where the control API, the
explorer UI and Anvil run — containers, or your machine. `--docker` works on `up`, `down`, `reset`
and `status`.

Open **http://localhost:3000**. First boot pulls a few GB of images and runs database migrations, so
give it a couple of minutes; later starts take seconds.

`stack/setup.sh` clones `blockscout/blockscout` (sparse — just the compose files) and
`blockscout/frontend` next to this repository, copies the DevNet pages from `stack/explorer-overlay`
into the frontend, applies a small patch to five upstream files (navigation, page metadata, analytics
page types, transaction tabs, one search-input fix) and installs dependencies. Blockscout's own code is never vendored
here — see [Licence and attribution](#licence-and-attribution).

### Everyday commands

```bash
./devnet.sh up          # start everything (safe to run when parts are already up)
./devnet.sh status      # what is running
./devnet.sh logs        # tail anvil + control API + UI logs
./devnet.sh down        # stop the UI, the control API and the containers
./devnet.sh reset       # wipe the index and the devnet state, then start fresh
./devnet.sh local       # address everything as localhost
./devnet.sh expose      # address everything as your LAN address
./devnet.sh tunnel      # address everything as public HTTPS (Cloudflare)
./devnet.sh fork <url>  # reset into a fork, with the indexer pinned to the fork height

./devnet.sh up --docker # …any of the above, with everything in containers
```

`reset` matters: Blockscout indexes by block height, so when Anvil restarts at block 0 the indexer
would keep serving the old chain. `reset` clears the control API's tables, drops the Blockscout
volumes and reindexes from scratch.

### Which address is it on?

`./devnet.sh status` prints both columns — the loopback addresses for this machine and the LAN
addresses for everyone else:

```
                On this machine              On your network
  Explorer      http://localhost:3000        http://192.168.1.42:3000
  RPC           http://127.0.0.1:8545        http://192.168.1.42:8545
  Explorer API  http://localhost/api/v2      http://192.168.1.42/api/v2
```

The port comes from the node that is actually running, not from `DEVNET_RPC_PORT`, so it is right
even when someone started Anvil somewhere else. `GET /api/anvil/status` returns the same thing as
`lanIp` and `port` if you want it in a script:

```bash
curl -s localhost:3010/api/anvil/status | jq -r '"http://\(.lanIp):\(.port)"'
```

The network column is only reachable after `./devnet.sh expose` — see
[Sharing it on your network](#sharing-it-on-your-network).

### Where things live

| URL | What |
| --- | --- |
| http://localhost:3000 | Explorer UI |
| http://localhost:3000/devnet | DevNet control pages |
| http://localhost/api/v2 | Blockscout REST API |
| http://localhost:3010/api | DevNet Control API (this repo) |
| http://localhost:3010/api/explorer | Etherscan-compatible read API |
| http://127.0.0.1:8546 | The devnet JSON-RPC endpoint (whatever port the node runs on) |

---

## The chain survives a restart

A node is started with Anvil's `--state`, which loads the previous chain on the way up and writes it
back as it runs — so stopping and starting the same chain picks up where it left off, patched
balances and installed contracts included.

The writing happens on an interval (`stateInterval`, 30 seconds by default) rather than only at exit.
`--dump-state` alone writes on a clean shutdown and nowhere else, so a node that is killed, crashes,
or has its container recreated loses everything since it started — all three of which happen.

Two things worth knowing:

- Every block Anvil mines costs about 1.7 KB in that file whether or not anything happened in it,
  which is why the default block time is 15 seconds rather than 2. A chain left running for weeks
  still grows; `./devnet.sh reset` clears it.
- `persistState: false` on `/api/anvil/start` turns it off for a throwaway chain.

---

## Chain id, restarts and the explorer index

Starting or resetting a node from `/devnet` reconfigures Blockscout automatically:

- the indexer is pointed at the node's port and chain id
- its databases are dropped, so the previous chain's blocks cannot linger
- the explorer UI is relabelled for the chain (`BNB Chain DevNet`, BNB, chain 56, …) and restarted
- indexing restarts from block 0

That last point matters because Blockscout indexes by block height. A devnet that restarts at
block 0 would otherwise collide with the old chain's history, and you would see transactions that
no longer exist. The `/devnet` page shows the progress while the containers come back — usually a
minute or two.

Set `DEVNET_EXPLORER_AUTOSYNC=0` to turn this off and manage the stack by hand.

> **Blockscout keeps Postgres in bind mounts, not named volumes**, so `docker compose down -v`
> alone does *not* delete the old chain's data — `services/blockscout-db-data`,
> `services/stats-db-data` and `services/dets` have to be removed as well. Both the auto-sync and
> `./devnet.sh reset` do this.

### Running a mainnet chain id without forking

You do not need a fork to work against a chain id like 56. Start a plain node with that id and put
the code you want at the address you want:

```bash
# a local BNB Chain devnet — no fork, no upstream history
curl -X POST http://localhost:3010/api/anvil/start \
  -H "Content-Type: application/json" \
  -d '{ "chainId": 56, "port": 8546, "blockTime": 2, "accounts": 10, "balance": 10000 }'
```

Then use the state patches to make a mainnet address behave like the real thing. `/api/patches/code`
installs contract code at any address — the built-in ERC-20 with the metadata you choose, your own
creation bytecode, or raw runtime bytecode:

```bash
# BSC's real USDT address, now a working token on your local chain
curl -X POST http://localhost:3010/api/patches/code \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x55d398326f99059fF775485246999027B3197955",
    "mode": "erc20", "name": "Tether USD", "symbol": "USDT",
    "decimals": 18, "totalSupply": "1000000",
    "holder": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  }'
```

The explorer then shows it as Tether USD (USDT) and indexes its transfers like any other token.

Forking pulls the upstream chain's blocks and history into your explorer, which is rarely what you
want on a devnet — and public RPCs are unreliable enough that Anvil can panic mid-mine against them.

---

## Sharing it: three addresses, one switch

Every service already listens on all interfaces. What decides whether someone else can use the
explorer is a different thing entirely: the `NEXT_PUBLIC_*` URLs it hands to a browser. A visitor's
browser runs that bundle, so while it says `localhost`, that browser looks for the API on *its own*
machine and everything fails.

Three commands set that whole group consistently — the app's own origin, the Blockscout API, the RPC
a wallet is given, and the WebSocket scheme:

```bash
./devnet.sh local               # http://localhost:3000
./devnet.sh expose              # http://<your-lan-ip>:3000  (auto-detected)
./devnet.sh expose 192.168.1.42 # …or name the address yourself
./devnet.sh proxy               # http://localhost:8000 — one origin for everything
./devnet.sh tunnel              # https://<random>.trycloudflare.com, one origin
./devnet.sh domain devnet.example.com   # a hostname you already serve
```

`status` shows which one is in effect, straight from what the explorer is serving.

### One origin

`local` and `expose` put the explorer, the Blockscout API and the RPC on three different ports. That
works on a LAN, and it is why `localhost:3000` breaks while exposed: the page and the API end up on
different origins and the browser calls it cross-origin.

`proxy` puts all three behind one address:

```
http://localhost:8000/           the explorer and /devnet
http://localhost:8000/api/v2     Blockscout
http://localhost:8000/rpc        the JSON-RPC a wallet uses
```

A small nginx (`devnet-proxy`) serves `/rpc` and hands everything else to Blockscout's own nginx,
which already separates `/api` and `/socket` — and which now serves this fork at `/` instead of the
stock frontend. Blockscout's config is not modified or copied; it is reached through.

Same origin means no CORS anywhere, so the "use the LAN address, never localhost" caveat disappears.
It is also the shape a cloud deployment behind a reverse proxy takes, so the same values carry over
to a real domain.

`/rpc` goes to the control API's screening proxy, not to Anvil directly, so a shared URL cannot call
`anvil_*`, `evm_*` or `hardhat_*` while `DEVNET_READONLY=1`. Set `DEVNET_RPC_PROXY_PASS` to
`http://devnet-api:8545` when you want the raw node.

### Tunnel mode

`tunnel` switches to one origin first, then opens a single Cloudflare quick tunnel in front of it —
so the explorer, the API and the RPC all live under one HTTPS hostname. It needs `cloudflared`
(`brew install cloudflared`).

Two things it fixes that a LAN address cannot: wallets that refuse a plain-HTTP RPC endpoint, and
people who are not on your network at all. The URLs are HTTPS with no port, which is also what a
cloud deployment behind a reverse proxy looks like.

It defaults to `--protocol http2`. cloudflared prefers QUIC, and a network that blocks UDP/7844 —
phone hotspots often do — leaves the tunnel retrying forever behind Cloudflare's error 1033.
Override with `DEVNET_TUNNEL_PROTOCOL`.

It also retries far longer than cloudflared's default of five attempts, which a dropped link exhausts
in seconds — after that the process exits and the shared URL simply stops answering, with nothing on
screen to say so. Reconnects inside one process keep the same hostname, so retrying is what keeps a
link working; restarting cloudflared would hand out a different one. `DEVNET_TUNNEL_RETRIES` tunes it,
and `./devnet.sh status` reports whether the tunnel is still up:

```
  tunnel devnet   up    https://sells-providing-direct-reflected.trycloudflare.com
  tunnel devnet   DOWN  (exited — ./devnet.sh tunnel to reopen)
```

Quick tunnels get a new hostname on every restart, so these URLs are not stable. `./devnet.sh local`
closes them and puts everything back.

### A hostname of your own

`domain` points the explorer at an address you already serve — a named Cloudflare tunnel, a reverse
proxy, a VPS — over HTTPS with no port, which is what anything terminating TLS actually serves.
Nothing is started: the address exists already, and this only tells the explorer about it.

```bash
./devnet.sh domain devnet.example.com
```

Whatever terminates TLS for that hostname forwards to `http://localhost:8000`. With a named
Cloudflare tunnel that is one ingress rule:

```yaml
ingress:
  - hostname: devnet.example.com
    service: http://localhost:8000
  - service: http_status:404
```

Two things a named tunnel gets you over a quick one: the hostname survives restarts, so nobody has to
re-add the network; and `trycloudflare.com` is blocked outright by some mobile carriers, which a
phone reports only as a failure to fetch the chain id.

A stable hostname is also found in ways a random URL is not. Run the control API read-only for
anything you leave up:

```bash
./devnet.sh down && DEVNET_READONLY=1 ./devnet.sh up && ./devnet.sh domain devnet.example.com
```

| Share this | For |
| --- | --- |
| `http://<your-ip>:3000` | The explorer |
| `http://<your-ip>:8546` | The RPC endpoint (add as a custom network, using your chain id) |
| `http://<your-ip>/api/v2` | Blockscout's REST API |

`./devnet.sh local` puts it back. Re-run `expose` if your IP changes — a laptop that switches
networks will leave the explorer pointing at an address that no longer exists.

While exposed, open the explorer at `http://<your-ip>:3000` on your own machine too.
`http://localhost:3000` will render but fail to load data: the app calls its own API on
`<your-ip>`, and the browser blocks that as a cross-origin request.

### Read-only mode

The control API has no authentication. Anyone who can reach it can rewrite balances and storage,
stop your node or delete a project — fine on a trusted network, not fine on café Wi-Fi. For a shared
devnet, run it read-only:

```bash
./devnet.sh down
DEVNET_READONLY=1 ./devnet.sh up
./devnet.sh expose
```

The explorer stays fully usable — blocks, transactions, traces, the gas profiler and the storage
diff all work — while node control, state patches, project changes and state-changing RPC methods
(`anvil_*`, `evm_*`, `hardhat_*`) return `403`. Read methods (`eth_*`, `net_*`, `debug_trace*`) are
untouched.

macOS may ask to allow incoming connections the first time you expose the stack.

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEVNET_API_PORT` | `3010` | Port the control API listens on |
| `DEVNET_RPC_PORT` | `8546` | Anvil port to manage and index when no project is running |
| `DEVNET_CHAIN_ID` | `31337` | Chain id assumed before a node is started |
| `DEVNET_BLOCK_TIME` | `15` | Seconds between blocks; `0` mines only on transactions |
| `stateInterval` (start body) | `30` | Seconds between state dumps; `0` dumps only on a clean exit |
| `DEVNET_WORKSPACE` | parent of this repo | Where `blockscout/` and `blockscout-frontend/` are cloned |
| `DEVNET_DB_PATH` | `./devnet.db` | Move the SQLite file elsewhere |
| `DEVNET_READONLY` | unset | `1` disables every state-changing route and RPC method |
| `DEVNET_RPC_ALLOWED_ORIGIN` | `*` | Origin allowed to call `/api/rpc` from a browser |
| `DEVNET_TUNNEL_PROTOCOL` | `http2` | cloudflared transport; QUIC is blocked on many hotspots |
| `DEVNET_TUNNEL_RETRIES` | `500` | Reconnect attempts before the tunnel gives up and exits |
| `DEVNET_EXPLORER_AUTOSYNC` | `1` | `0` stops the explorer from following the node; manage the stack yourself |
| `DEVNET_RPC_HOST` | `host.docker.internal` | Host the Blockscout indexer reaches the node on. `--docker` sets it to the API container |
| `DEVNET_PUBLIC_HOST` | `localhost` | Host a *browser* uses for the explorer and the RPC; `devnet.sh expose` rewrites it |
| `DEVNET_COMPOSE_DIR` | `../blockscout/docker-compose` | Where Blockscout's compose files live |
| `DEVNET_FIRST_BLOCK` | `0` | Height the indexer starts from — `devnet.sh fork` sets it to the fork block |
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
bun run build:mock-erc20  # recompile contracts/MockERC20.sol into lib/mockErc20.ts (needs solc)
bun run smoke           # build, then run the end-to-end smoke test against a real Anvil
```

Tests run on Node's built-in runner with native TypeScript support — no build step and no test
framework dependency. `bun run smoke` goes further: it boots a real Anvil and the built server and
drives them over HTTP — node discovery, reading a node's config off the wire, installing ERC-20 code,
a real transfer, the trace pipeline and its cache, the Etherscan-compatible API, and a 400 for bad
input. Both run in CI on every push, because every bug that has actually shipped lived in the seams
rather than in the pure layers.

The unit tests cover the pure layers: formatting, input validation, indexer mapping,
Anvil argument construction, storage-slot derivation, the SQLite schema and migrations, project
resolution, block-time inference from block timestamps, and the ERC-20 constructor encoding the code
patcher installs.

---

## How it fits together

**Blockscout does the reading.** Its official `anvil.yml` preset points the indexer at
`host.docker.internal`, so the devnet must listen on `0.0.0.0` — the control API always starts Anvil
that way. `stack/docker-compose/devnet.override.yml` sets the RPC port and chain id (rewritten whenever the
explorer follows a node), disables Ecto's SSL because the bundled Postgres does not speak TLS, and
turns off Blockscout's API rate limit — inside Docker every container and every browser reaches the
backend from the same gateway address, so they share one bucket and a fast-mining chain drains it.

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
- **Code is installed by simulating a deployment.** `anvil_setCode` takes runtime bytecode, so it
  never runs a constructor — a token installed that way has no name, no symbol and no supply. The
  patcher runs the creation bytecode inside `debug_traceCall` instead, which executes the constructor
  without mining anything, and the prestate tracer reports the code it returned plus every slot it
  wrote. Both are then written to the target address. The one thing this cannot preserve is an
  immutable holding `address(this)`, which records the simulated address.
- **A node's settings are read, never remembered.** `anvil_nodeInfo` gives the chain id, base fee and
  fork config, `eth_accounts` the account count, `eth_getBalance` the funding. Block time is the
  exception — Anvil does not expose it, so it is inferred from the gaps between recent blocks. Equal
  gaps mean `--block-time`; anything else is on-demand mining and the field stays blank rather than
  inventing a number.
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
| `POST` | `/api/anvil/start` | `{ chainId, port, blockTime, accounts, balance, baseFee, stateInterval?, persistState?, forkUrl?, forkBlockNumber? }` | Spawn Anvil; the fork block is pinned automatically |
| `POST` | `/api/anvil/stop` | — | SIGTERM, then SIGKILL after 3 s, then free the port |
| `GET` | `/api/anvil/status` | — | `{ running, managed, pid, port, chainId, blockNumber, gasPrice, uptime, lastError, config, configSource, explorer }` — `config` is read off the running node, `explorer` reports the chain and port Blockscout is indexing plus any sync in progress |
| `GET` | `/api/anvil/logs` | `?limit=200` | Recent process output, the log path and the last start error |
| `GET` | `/api/anvil/processes` | — | Every Anvil listening on the machine, with pid, port, bind address and whether this app started it |
| `DELETE` | `/api/anvil/processes` | `{ pid }`, `{ port }` or `{ all: true }` | Stop a stray node holding a port (never touches non-Anvil processes) |
| `POST` | `/api/anvil/reset` | `{ chainId? }` | Stop the node, clear indexed rows and delete the persisted state |
| `POST` | `/api/anvil/explorer-sync` | — | Point Blockscout at the node running right now, without waiting for the watcher |

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
| `GET` | `/api/patches/code` | `?address=0x…` | What code (and token metadata) is at an address |
| `POST` | `/api/patches/code` | `{ address, mode: "erc20", name, symbol, decimals?, totalSupply?, holder? }` | Install the built-in ERC-20 at an address |
| `POST` | `/api/patches/code` | `{ address, mode: "creation", bytecode, constructorArgs? }` | Run your constructor and install what it deploys |
| `POST` | `/api/patches/code` | `{ address, mode: "runtime", bytecode }` | Write runtime bytecode verbatim |
| `POST` | `/api/patches/fund` | `{ type: "native", address, amount, announce? }` | Set an ETH balance |
| `POST` | `/api/patches/fund` | `{ type: "erc20", token, address, amount, decimals?, mappingSlot?, announce? }` | Set an ERC-20 balance |
| `GET` | `/api/patches/storage` | `?contract=0x…&slot=0x0` | Read a storage slot |
| `POST` | `/api/patches/storage` | `{ contract, slot, value }` | Write a storage slot |
| `GET` / `POST` | `/api/patches/scripts` | `{ action: "save" \| "run" \| "delete", … }` | Save and replay batches of patches |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/patches/profiles` | `{ name, chainId, forkUrl, … }` | Saved fork profiles (presets: Ethereum, BSC, opBNB, local) |

Both patches write state directly, which no block records — so the explorer would keep showing the
old balance, or nothing at all. Each one therefore ends with a zero-value transaction that puts the
address (and, for a token, a `Transfer` event) into the next block, which is what makes Blockscout
look. It is sent *to* the address, so the funded account's own nonce is untouched and a dev account
pays the gas. Pass `"announce": false` to skip it when a test is counting blocks.

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

`/api/rpc` answers CORS preflights and carries `Access-Control-Allow-Origin` on every response,
success or error, so a dapp on another origin — a Vite dev server, a tunnel, a phone — can call it
directly. Controlled by `DEVNET_RPC_ALLOWED_ORIGIN` (default `*`).

---

## Project layout

```
anvil-devnet-ui/
├── app/
│   ├── page.tsx                  # API signpost — the UI lives in the explorer
│   └── api/                      # every route above
├── lib/
│   ├── db.ts                     # schema + migrations (WAL, 14 tables)
│   ├── sqlite.ts                 # node:sqlite adapter with a statement cache
│   ├── anvilProcess.ts           # spawn / stop / orphan cleanup
│   ├── activeProject.ts          # which node does this request target?
│   ├── nodeObserver.ts           # read a running node's real settings over RPC
│   ├── explorerStack.ts          # reconfigure and reindex Blockscout for the live node
│   ├── indexer.ts                # RPC block/tx → DB row mapping
│   ├── txStore.ts                # block / tx / trace persistence
│   ├── abiRegistry.ts            # ABI storage, decoding, Sourcify + Etherscan V2
│   ├── patcher.ts                # fund native, fund ERC-20, write storage
│   ├── codePatcher.ts            # install contract code + constructor storage at an address
│   ├── tokenBalances.ts          # balances, slot detection, mock ERC-20 injection
│   ├── projectStore.ts           # project CRUD + cascade delete
│   ├── validate.ts / route.ts    # input validation and uniform error handling
│   └── rpc.ts                    # viem client + rpc()/rpcBatch()
├── proxy.ts                      # read-only guard (DEVNET_READONLY)
├── instrumentation.ts            # the watcher that keeps the explorer on the live node
├── Dockerfile                    # the control API image (published — no Blockscout in it)
├── contracts/
│   └── MockERC20.sol             # the token /api/patches/code installs (bun run build:mock-erc20)
├── stack/
│   ├── setup.sh                  # fetch Blockscout, apply the DevNet overlay
│   ├── Dockerfile.explorer       # the explorer UI image — built locally, never published
│   ├── explorer-build/
│   │   └── patch-next-config.js  # untraced-package closure + build worker cap (see next.config.js patch)
│   ├── docker-compose/
│   │   ├── devnet.override.yml   # Blockscout env for the anvil preset
│   │   ├── devnet-stack.yml      # devnet-api + devnet-ui as containers (--docker)
│   │   ├── devnet-proxy.yml      # single-origin front door (devnet.sh proxy / tunnel)
│   │   └── proxy/                # devnet-proxy's nginx config
│   └── explorer-overlay/         # the DevNet UI (our code) + upstream.patch
├── tests/                        # node --test unit tests
├── scripts/                      # resetDb.ts, buildMockErc20.ts, smoke.ts
└── devnet.sh                     # start / stop / reset the whole stack
```

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/api` returns **502** from the explorer | nginx caches the backend's IP at boot; a backend restart leaves it stale. `docker restart proxy` (`devnet.sh up` does this automatically). |
| Backend crash-loops with **“ssl not available”** | The bundled Postgres has no TLS. `ECTO_USE_SSL=false` is set in `devnet.override.yml` — make sure the override is actually passed. |
| Blockscout shows **blocks that no longer exist** | Anvil restarted at block 0 while the index kept the old chain. Run `./devnet.sh reset`. |
| The indexer never sees the chain | Anvil must listen on `0.0.0.0`, otherwise the containers cannot reach it through `host.docker.internal`. Start it via `devnet.sh` or the control API. The Anvil processes list on `/devnet` shows each node's bind address. |
| **“Port already in use”** when starting | Something else is on that port — often a node from an earlier session. The Anvil processes list on `/devnet` shows every listening Anvil with a Stop button, including ones this app did not start. |
| `pnpm install` fails building **node-datachannel** | A transitive WebRTC dependency compiles native code. Install with `--ignore-scripts` (what `stack/setup.sh` does); nothing needs it at runtime. |
| `pnpm dev:local` fails on **`git describe`** | The frontend clone has no tags. `git tag devnet-fork-base` inside it (also done by `stack/setup.sh`). |
| **“Cannot find module node:sqlite”** | Node is older than 22.5. Upgrade Node — Bun does not implement `node:sqlite`, but `next dev`/`next build` run under Node anyway. |
| Explorer pages **500**, everything returns `Too Many Requests` | Blockscout's API rate limit — 300 requests per minute per IP by default. The frontend, the stats service and every browser all reach the backend from the same Docker gateway address, so they share one bucket, and a chain mining every two seconds empties it. `API_RATE_LIMIT_DISABLED=true` is set in `devnet.override.yml`; make sure the override is passed. |
| The explorer image build is **killed** (exit 137, `cannot allocate memory`) | Compiling Blockscout's frontend is the heaviest thing in this project — upstream's own Dockerfile gives it an 8 GB heap. Raise Docker Desktop's memory (Settings → Resources) to 12 GB if you can, and stop the stack while it builds. `--build-arg NODE_HEAP_MB=8192` uses the extra room. |
| The explorer has **no icons, logo or menu button** | Every icon comes from `sprite.<hash>.svg`, and the app asks for whatever `NEXT_PUBLIC_ICON_SPRITE_HASH` says at runtime. The image derives it from the file actually present at container start; if you build the frontend yourself, source `deploy/scripts/build_sprite.sh` (it exports the hash) rather than running it as a subprocess. |
| The explorer image **fails to build** at `git apply` | Blockscout moved a file this project patches. `stack/Dockerfile.explorer` pins the upstream commit `upstream.patch` was generated against — if you bumped `BLOCKSCOUT_FRONTEND_REF`, regenerate the patch against the new tree. |
| `--docker`: a node started **on your host is invisible** | The control API talks to nodes over `127.0.0.1`, which inside a container is the container. With `--docker`, start the node from the `/devnet` page so it runs there too. Use the from-source path if you want to keep starting Anvil by hand. |
| `--docker`: a node on a **non-default port is unreachable from the host** | Only `DEVNET_RPC_PORT` is published from the API container. The indexer still follows the node over the compose network, but `cast`/MetaMask on your machine will not reach it — restart with `DEVNET_RPC_PORT=<port> ./devnet.sh up --docker`. |
| `--docker`: the explorer **stops following the node** | The auto-sync runs `docker compose` against the host daemon, so the compose directory is bind-mounted at the same absolute path inside the container. A different `DEVNET_COMPOSE_DIR` on either side breaks it. |
| The trace tab says **tracing unavailable** | The node was started without `--steps-tracing`, or you are on a fork whose RPC blocks `debug_traceTransaction`. |
| Single origin: node control and state patches answer with **"Params 'module' and 'action' are required"** | Blockscout's nginx sends everything under `/api` to its backend, `/api/devnet/*` included. `devnet-proxy`'s config claims that prefix first — make sure `stack/docker-compose/proxy/default.conf.template` is actually mounted (`devnet.sh proxy` / `tunnel` do this). |
| Single origin: `/rpc` or `/api/devnet` return **502** after a restart | nginx resolves an upstream hostname once, at startup, and keeps that address after `devnet-ui` or `devnet-api` is recreated. `devnet.sh` restarts the front door (`devnet-proxy`) whenever addressing changes; if you recreated those containers by hand, `docker restart devnet-proxy` yourself. |
| The explorer image builds, but **`/address` (or any page reaching a wallet) returns 500** with `ERR_MODULE_NOT_FOUND` | The webpack tracer behind `output: standalone` cannot follow `@libp2p/config`'s dynamic imports, and — subtler — a package can be traced in and still unreachable, because pnpm resolves through a farm of relative symlinks that tracing does not reproduce. `stack/explorer-build/patch-next-config.js` walks the real dependency closure over pnpm's symlinks and copies those directories with `cp -a`, links intact; it runs automatically as part of the image build. |

---

## Licence and attribution

This repository is **MIT** licensed — see [LICENSE](LICENSE).

That covers this project's code only. The explorer is
[Blockscout](https://github.com/blockscout/blockscout), distributed under its own licence
(`LicenseRef-Blockscout`), and **Blockscout's source is not vendored here** — `stack/setup.sh`
fetches it from Blockscout directly and applies our overlay on your machine.

Two clauses of that licence shape how this project is built and distributed:

- **§4(b) — derivative works may not be distributed.** The patched frontend is a derivative work, so
  it may be created for your own use but not handed to third parties without a commercial licence
  from Blockscout. That is why the explorer UI image is built locally by `docker compose` and is
  never published to a registry. The control API image, which contains none of Blockscout's code, is.
- **§4(d) — modified files must say so.** Each upstream file this project patches carries a notice
  naming the project and the date it was modified.

Blockscout's branding and footer attribution are left intact, as its licence requires. Read
[their licence](https://github.com/blockscout/frontend/blob/main/LICENSE) before deploying anything
based on it.

Built with [Foundry](https://github.com/foundry-rs/foundry) (Anvil), [viem](https://viem.sh),
[Next.js](https://nextjs.org) and [Blockscout](https://blockscout.com).
