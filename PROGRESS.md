# Anvil DevNet UI — Progress

## ✅ Phase 1 — Local Explorer (DONE)

Full local devnet explorer built and shipped.

- Next.js 16 App Router, TypeScript, Bun
- Dashboard, Blocks, Transactions, Accounts, Contracts, Tokens, EVM, Patches, Simulate pages
- SSE live streaming, Zustand state, chain persistence
- Full Twitter dark theme (tweakcn tokens)
- GitHub icon in Navbar, Footer with attribution + Buy Me a Coffee
- FUNDING.yml for GitHub Sponsor button
- Deployed, committed, pushed ✅

---

## 🔜 Phase 2 — Remote Agent Mode (TODO)

### Goal

User apne machine pe Anvil chalaye aur haari hosted website pe live data dekhe — **zero server cost**.

### Architecture

```
[User's Machine]
├── Anvil (localhost:8545)
└── npx anvil-connect
    ├── Polls Anvil RPC every block
    ├── Stores data locally (SQLite)
    ├── State persists on close → resumes on reopen
    └── Exposes WebSocket at ws://localhost:3001
              ↓ direct browser connection
[Hosted Frontend (Vercel — free)]
└── Connects to ws://localhost:3001
    ├── Receives historical blocks from local DB
    └── Receives live stream going forward
```

### Cost

| Component        | Cost                     |
| ---------------- | ------------------------ |
| Relay Server     | Not needed               |
| Database         | SQLite on user's machine |
| Frontend hosting | Vercel free tier         |
| **Total**        | **$0**                   |

### Deliverables

1. `packages/agent` — `npx anvil-connect` CLI
   - Bun/Node.js
   - SQLite via `better-sqlite3`
   - WebSocket server (`ws` package)
   - Polls `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getTransactionByHash`
   - State resume on restart

2. Frontend changes
   - Connection mode toggle: `local RPC` vs `agent (ws://localhost:3001)`
   - Swap SSE/RPC calls → WebSocket message handler
   - Historical data hydration on connect

3. npm publish
   - Package name: `anvil-connect`
   - One-liner: `npx anvil-connect --rpc http://localhost:8545`

### Open Questions

- Browser → localhost WebSocket: CORS/mixed-content issues on HTTPS? (may need HTTP frontend or user installs cert)
- Auth: Token-based pairing agar multiple users on same machine?
