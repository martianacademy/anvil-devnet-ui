"use client";

/**
 * Small fetch wrapper for the browser: adds the active project header, parses
 * JSON, and turns `{ error }` responses into thrown Errors so callers can use
 * a single try/catch instead of hand-checking every response.
 */

export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/** Set by the project store so every request targets the selected node. */
let activeProjectId: string | null = null;

export function setApiProjectId(id: string | null) {
    activeProjectId = id;
}

export function getApiProjectId(): string | null {
    return activeProjectId;
}

/** Append the active project to a URL — used for EventSource, which can't send headers. */
export function withProject(url: string): string {
    if (!activeProjectId) return url;
    return `${url}${url.includes("?") ? "&" : "?"}projectId=${encodeURIComponent(activeProjectId)}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (activeProjectId) headers.set("x-project-id", activeProjectId);
    if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const res = await fetch(url, { ...init, headers });

    let data: unknown = null;
    try {
        data = await res.json();
    } catch {
        if (!res.ok) throw new ApiError(`Request failed: HTTP ${res.status}`, res.status);
    }

    if (!res.ok) {
        const message = (data as { error?: string })?.error ?? `Request failed: HTTP ${res.status}`;
        throw new ApiError(message, res.status);
    }
    if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
        throw new ApiError((data as { error: string }).error, res.status);
    }
    return data as T;
}

export const api = {
    get: <T>(url: string, init?: RequestInit) => request<T>(url, { ...init, method: "GET" }),
    post: <T>(url: string, body?: unknown, init?: RequestInit) =>
        request<T>(url, { ...init, method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
    patch: <T>(url: string, body?: unknown) =>
        request<T>(url, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
    del: <T>(url: string, body?: unknown) =>
        request<T>(url, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) }),
};

/** Etherscan-style envelope used by /api/explorer. */
export interface ExplorerEnvelope<T> {
    status: string;
    message: string;
    result: T;
    total?: number;
}

/** Explorer helper: unwraps `result`, returning `fallback` when the call reports NOTOK. */
export async function explorer<T>(query: string, fallback: T): Promise<{ result: T; total: number | null }> {
    const data = await api.get<ExplorerEnvelope<T>>(`/api/explorer?${query}`).catch(() => null);
    if (!data || data.status !== "1") return { result: fallback, total: null };
    return { result: data.result, total: data.total ?? null };
}

/** JSON-RPC through the server proxy (keeps the node port server-side). */
export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
    const data = await api.post<{ result?: T; error?: { message: string } }>("/api/rpc", {
        jsonrpc: "2.0",
        method,
        params,
        id: 1,
    });
    if (data.error) throw new ApiError(data.error.message, 200);
    return data.result as T;
}
