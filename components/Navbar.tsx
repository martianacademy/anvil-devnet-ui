"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDevnetStore } from "@/store/useDevnetStore";

const NAV_ITEMS = [
    { href: "/", label: "Dashboard" },
    { href: "/blocks", label: "Blocks" },
    { href: "/accounts", label: "Accounts" },
    { href: "/contracts", label: "Contracts" },
    { href: "/tokens", label: "Tokens" },
    { href: "/evm", label: "EVM" },
    { href: "/patches", label: "Patches" },
    { href: "/simulate", label: "Simulate" },
];

export function Navbar() {
    const pathname = usePathname();
    const { nodeStatus, latestBlock, chainId, port } = useDevnetStore();

    const statusDot = {
        running: "bg-green-400 animate-pulse",
        starting: "bg-yellow-400 animate-pulse",
        stopped: "bg-gray-500",
        error: "bg-red-500",
    }[nodeStatus];

    return (
        <nav className="bg-gray-950 border-b border-gray-800 px-4 py-2">
            <div className="flex items-center gap-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-2">
                    <span className="text-white font-bold font-mono text-sm">⚒ ANVIL</span>
                    <div className={`w-2 h-2 rounded-full ${statusDot}`} />
                </div>

                <div className="hidden md:flex items-center gap-1">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${pathname === item.href
                                    ? "bg-gray-700 text-white"
                                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>

                <div className="ml-auto flex items-center gap-3 text-xs font-mono text-gray-400">
                    {nodeStatus === "running" && (
                        <>
                            <span>Chain: <span className="text-white">{chainId}</span></span>
                            <span>Port: <span className="text-white">{port}</span></span>
                            <span>Block: <span className="text-green-400">{latestBlock}</span></span>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
