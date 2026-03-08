"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Menu, Settings2, Zap, Github } from "lucide-react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { AnvilControls } from "@/components/AnvilControls";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
    { href: "/", label: "Dashboard" },
    { href: "/blocks", label: "Blocks" },
    { href: "/transactions", label: "Transactions" },
    { href: "/accounts", label: "Accounts" },
    { href: "/contracts", label: "Contracts" },
    { href: "/tokens", label: "Tokens" },
    { href: "/evm", label: "EVM" },
    { href: "/patches", label: "Patches" },
    { href: "/simulate", label: "Simulate" },
];

const statusDotClass: Record<string, string> = {
    running: "bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.7)] animate-pulse",
    starting: "bg-yellow-400 shadow-[0_0_6px_2px_rgba(250,204,21,0.7)] animate-pulse",
    error: "bg-red-500   shadow-[0_0_6px_2px_rgba(239,68,68,0.7)]",
    stopped: "bg-muted-foreground/40",
};

export function Navbar() {
    const pathname = usePathname();
    const { nodeStatus, chainId, port, addTransactions, setLatestBlock } = useDevnetStore();

    // ── Global SSE connection ─────────────────────────────────────────────────
    // Navbar is always mounted on every page, so this is the right place to own
    // the SSE stream that records blocks + transactions into the DB/store.
    const eventSourceRef = useRef<EventSource | null>(null);

    // Hydrate store from DB whenever Anvil starts (or chainId switches)
    useEffect(() => {
        if (nodeStatus !== "running") return;
        fetch(`/api/explorer?module=tx&action=getrecentlist&limit=200`)
            .then((r) => r.json())
            .then((d) => {
                if (Array.isArray(d.result)) {
                    addTransactions(
                        (d.result as any[]).map((tx) => ({
                            hash: tx.hash,
                            block_number: tx.block_number,
                            block_timestamp: tx.block_timestamp,
                            from_address: tx.from_address,
                            to_address: tx.to_address,
                            value: tx.value,
                            gas_used: tx.gas_used,
                            status: tx.status,
                            decoded_function: tx.decoded_function,
                            input: tx.input,
                        }))
                    );
                }
            })
            .catch(() => { });
    }, [nodeStatus, chainId]);

    // Open SSE stream — writes blocks+txs to DB and updates store live
    useEffect(() => {
        if (nodeStatus !== "running") {
            eventSourceRef.current?.close();
            eventSourceRef.current = null;
            return;
        }
        // Already open
        if (eventSourceRef.current) return;

        const es = new EventSource("/api/stream");
        eventSourceRef.current = es;

        es.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === "tx") {
                addTransactions([{
                    hash: data.hash,
                    block_number: data.blockNumber,
                    block_timestamp: Date.now() / 1000,
                    from_address: data.from,
                    to_address: data.to,
                    value: data.value,
                    gas_used: data.gasUsed,
                    status: data.status === "success" ? 1 : 0,
                    decoded_function: data.decodedFunction,
                    input: null,
                }]);
            } else if (data.type === "block") {
                setLatestBlock(data.number);
            }
        };

        es.onerror = () => {
            es.close();
            eventSourceRef.current = null;
        };

        return () => {
            es.close();
            eventSourceRef.current = null;
        };
    }, [nodeStatus]);
    // ─────────────────────────────────────────────────────────────────────────

    // Anvil Controls popover
    const [showControls, setShowControls] = useState(false);
    const controlsRef = useRef<HTMLDivElement>(null);

    // Close controls when clicking outside
    useEffect(() => {
        if (!showControls) return;
        function handler(e: MouseEvent) {
            const target = e.target as Element;
            // Keep open when clicking inside the panel itself
            if (controlsRef.current?.contains(target)) return;
            // Keep open when clicking inside a popover portal (e.g. chain selector dropdown)
            // @base-ui/react portals render outside controlsRef but PopoverPrimitive.Popup
            // always has data-slot="popover-content" on its root element.
            if (target.closest('[data-slot="popover-content"]')) return;
            setShowControls(false);
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showControls]);

    // Mobile drawer
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
            <div className="flex items-center gap-3 max-w-7xl mx-auto px-3 h-12">

                {/* Logo */}
                <Link href="/" className="flex items-center gap-1.5 shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-foreground font-bold font-mono text-sm tracking-wider">ANVIL</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${statusDotClass[nodeStatus] ?? statusDotClass.stopped}`} />
                </Link>

                {/* Desktop nav links */}
                <div className="hidden md:flex items-center gap-0.5 ml-2">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${pathname === item.href
                                ? "bg-accent text-primary"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* GitHub link — desktop */}
                <a
                    href="https://github.com/martianacademy/anvil-devnet-ui"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                    <Github className="w-4 h-4" />
                </a>

                {/* Live chain info — desktop only */}
                {nodeStatus === "running" && (
                    <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
                        <span>Chain <span className="text-primary font-semibold">{chainId}</span></span>
                        <span>Port <span className="text-primary font-semibold">{port}</span></span>
                    </div>
                )}

                {/* Anvil Controls trigger — always visible */}
                <div className="relative shrink-0" ref={controlsRef}>
                    <button
                        onClick={() => setShowControls((v) => !v)}
                        className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 text-xs font-mono transition-all duration-150 ${nodeStatus === "running"
                            ? "bg-green-950/60 border-green-800/60 text-green-300 hover:bg-green-900/60"
                            : nodeStatus === "starting"
                                ? "bg-yellow-950/60 border-yellow-800/60 text-yellow-300 hover:bg-yellow-900/60"
                                : nodeStatus === "error"
                                    ? "bg-red-950/60 border-red-800/60 text-red-300 hover:bg-red-900/60"
                                    : "bg-card border-border text-muted-foreground hover:bg-accent"
                            }`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass[nodeStatus] ?? statusDotClass.stopped}`} />
                        <span className="capitalize">{nodeStatus}</span>
                        <Settings2 className="w-3 h-3 opacity-60" />
                    </button>

                    {showControls && (
                        <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-1rem)] shadow-2xl rounded-2xl overflow-hidden">
                            <AnvilControls />
                        </div>
                    )}
                </div>

                {/* Hamburger — mobile only */}
                <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                    <SheetTrigger className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-card hover:bg-accent transition-colors shrink-0">
                        <Menu className="w-4 h-4 text-muted-foreground" />
                    </SheetTrigger>
                    <SheetContent side="left" className="w-64 bg-background border-border p-0">
                        <SheetHeader className="px-4 py-4 border-b border-border">
                            <SheetTitle className="flex items-center gap-2 text-sm font-mono">
                                <Zap className="w-4 h-4 text-primary" />
                                ANVIL DevNet
                            </SheetTitle>
                        </SheetHeader>
                        <nav className="flex flex-col py-2">
                            {NAV_ITEMS.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setDrawerOpen(false)}
                                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${pathname === item.href
                                        ? "bg-accent text-primary border-l-2 border-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                        {nodeStatus === "running" && (
                            <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-card border border-border text-xs font-mono text-muted-foreground space-y-1">
                                <div>Chain <span className="text-primary font-semibold">{chainId}</span></div>
                                <div>Port <span className="text-primary font-semibold">{port}</span></div>
                            </div>
                        )}
                        <div className="mx-4 mt-4 pt-4 border-t border-border">
                            <a
                                href="https://github.com/martianacademy/anvil-devnet-ui"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                            >
                                <Github className="w-4 h-4" />
                                View on GitHub
                            </a>
                        </div>
                    </SheetContent>
                </Sheet>

            </div>
        </nav>
    );
}
