/** Thrown by the validators below; turned into a 400 by `handleRoute`. */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

/** Throw to return a specific HTTP status from a `handleRoute` handler. */
export class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

export function assertAddress(value: unknown, field = "address"): `0x${string}` {
    if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
        throw new ValidationError(`${field} must be a 20-byte hex address (0x…)`);
    }
    return value.toLowerCase() as `0x${string}`;
}

export function assertTxHash(value: unknown, field = "hash"): `0x${string}` {
    if (typeof value !== "string" || !HASH_RE.test(value)) {
        throw new ValidationError(`${field} must be a 32-byte hex hash (0x…)`);
    }
    return value.toLowerCase() as `0x${string}`;
}

export function assertHex(value: unknown, field = "value"): `0x${string}` {
    if (typeof value !== "string" || !HEX_RE.test(value)) {
        throw new ValidationError(`${field} must be a 0x-prefixed hex string`);
    }
    return value as `0x${string}`;
}

/** Accepts a decimal or 0x-prefixed slot and normalises it to 32-byte hex. */
export function assertSlot(value: unknown, field = "slot"): `0x${string}` {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        return `0x${value.toString(16)}`;
    }
    if (typeof value !== "string" || value.trim() === "") {
        throw new ValidationError(`${field} must be a hex or decimal storage slot`);
    }
    const raw = value.trim();
    if (HEX_RE.test(raw)) return raw as `0x${string}`;
    if (/^\d+$/.test(raw)) return `0x${BigInt(raw).toString(16)}`;
    throw new ValidationError(`${field} must be a hex or decimal storage slot`);
}

/** Positive-decimal amount ("1.25"), rejects NaN / negatives / exponent notation. */
export function assertAmount(value: unknown, field = "amount"): string {
    const raw = typeof value === "number" ? String(value) : value;
    if (typeof raw !== "string" || !/^\d+(\.\d+)?$/.test(raw.trim())) {
        throw new ValidationError(`${field} must be a positive decimal number`);
    }
    return raw.trim();
}

export function assertInt(value: unknown, field: string, min: number, max: number): number {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
        throw new ValidationError(`${field} must be an integer between ${min} and ${max}`);
    }
    return n;
}

export function assertNonEmptyString(value: unknown, field: string, maxLen = 200): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new ValidationError(`${field} is required`);
    }
    if (value.length > maxLen) {
        throw new ValidationError(`${field} must be at most ${maxLen} characters`);
    }
    return value.trim();
}

/** Only http(s) URLs — blocks file://, ws://, and other schemes reaching `anvil --fork-url`. */
export function assertHttpUrl(value: unknown, field = "url"): string {
    const raw = assertNonEmptyString(value, field, 2048);
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new ValidationError(`${field} must be a valid URL`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new ValidationError(`${field} must be an http(s) URL`);
    }
    return raw;
}

/** Clamp a query-string integer, falling back to `fallback` when absent/garbage. */
export function clampInt(value: string | null, fallback: number, min: number, max: number): number {
    const n = value === null ? NaN : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
}
