/**
 * The control plane is headless: its UI now lives inside the Blockscout frontend
 * fork at http://localhost:3000/devnet. This page is only a signpost for anyone
 * who opens the API port directly.
 */
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "http://localhost:3000";

const ENDPOINTS = [
  ["GET  /api/anvil/status", "node status, chain id, block height"],
  ["POST /api/anvil/start | /stop | /reset", "process control"],
  ["POST /api/anvil/mine | /time | /impersonate", "EVM control"],
  ["GET|POST /api/anvil/snapshot, POST /api/anvil/revert", "snapshots"],
  ["POST /api/patches/fund | /storage | /scripts", "state patches"],
  ["POST /api/simulate", "dry-run a call inside a reverted snapshot"],
  ["GET  /api/tx/{hash} | /api/tx/{hash}/trace", "transaction + debug trace"],
  ["GET|POST /api/projects", "multi-devnet projects"],
  ["GET  /api/explorer?module=…", "Etherscan-compatible read API"],
  ["GET  /api/stream", "SSE block/transaction feed"],
];

export default function ControlApiHome() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", fontFamily: "var(--font-geist-mono), monospace" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Anvil DevNet Control API</h1>
      <p style={{ opacity: 0.7, marginBottom: 24, lineHeight: 1.6 }}>
        Headless service. The user interface lives in the Blockscout explorer at{" "}
        <a href={`${EXPLORER_URL}/devnet`} style={{ textDecoration: "underline" }}>
          {EXPLORER_URL}/devnet
        </a>
        .
      </p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {ENDPOINTS.map(([route, description]) => (
          <li key={route} style={{ display: "grid", gap: 2 }}>
            <code style={{ fontSize: 12 }}>{route}</code>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{description}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
