"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
    data: T;
    error: string | null;
    loading: boolean;
    reload: () => void;
}

/**
 * Run an async loader on mount and whenever `deps` change.
 *
 * State is only ever written from inside the async callback (never synchronously
 * in the effect body), which keeps the React Compiler's `set-state-in-effect`
 * rule happy and avoids the cascading re-render it warns about.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[], initial: T): AsyncState<T> {
    const [data, setData] = useState<T>(initial);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [nonce, setNonce] = useState(0);

    // Kept in a ref (updated in its own effect, never during render) so a new
    // inline closure on every render doesn't retrigger the load.
    const loaderRef = useRef(loader);
    useEffect(() => {
        loaderRef.current = loader;
    });

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            try {
                const result = await loaderRef.current();
                if (!cancelled) {
                    setData(result);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Request failed");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce]);

    const reload = useCallback(() => setNonce((n) => n + 1), []);
    return { data, error, loading, reload };
}

/** Call `fn` immediately and then every `intervalMs` while `enabled` is true. */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
    const fnRef = useRef(fn);
    useEffect(() => {
        fnRef.current = fn;
    });

    useEffect(() => {
        if (!enabled) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;

        const tick = async () => {
            try {
                await fnRef.current();
            } catch { /* a failed poll must not kill the loop */ }
            if (!stopped) timer = setTimeout(tick, intervalMs);
        };
        void tick();

        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [intervalMs, enabled]);
}

/** Copy text to the clipboard and flash a "copied" flag for `resetMs`. */
export function useCopy(resetMs = 1500) {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = useCallback(async (text: string, key = text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied((c) => (c === key ? null : c)), resetMs);
        } catch { /* clipboard blocked — nothing to do */ }
    }, [resetMs]);

    return { copied, copy };
}
