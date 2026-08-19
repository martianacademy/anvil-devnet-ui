import { NextResponse } from "next/server";
import { HttpError, ValidationError } from "./validate.ts";

/**
 * Wraps a route handler so every route reports errors the same way:
 * ValidationError → 400, HttpError → its own status, anything else → 500,
 * always as `{ error: string }`.
 */
export async function handleRoute<T>(fn: () => Promise<T>): Promise<NextResponse> {
    try {
        return NextResponse.json((await fn()) as object);
    } catch (err) {
        if (err instanceof ValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        if (err instanceof HttpError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
