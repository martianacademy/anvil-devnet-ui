import Link from "next/link";

function GithubIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
    );
}

function CoffeeIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z" />
        </svg>
    );
}

export function Footer() {
    return (
        <footer className="mt-16 border-t border-border/50 bg-card/30 backdrop-blur-sm">
            {/* Gradient line */}
            <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    Built with{" "}
                    <span className="text-red-500 animate-pulse">♥</span>
                    {" "}by{" "}
                    <Link
                        href="https://github.com/martianacademy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                    >
                        <GithubIcon className="w-3.5 h-3.5" />
                        MartianAcademy
                    </Link>
                </p>

                <Link
                    href="https://buymeacoffee.com/martianacademy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-yellow-500/30 bg-yellow-500/5 text-yellow-400 hover:bg-yellow-500/15 hover:border-yellow-500/50 transition-all text-sm font-medium hover-lift"
                >
                    <CoffeeIcon className="w-4 h-4" />
                    Buy me a coffee
                </Link>
            </div>
        </footer>
    );
}
