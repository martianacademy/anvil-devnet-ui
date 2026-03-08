import { NextResponse } from "next/server";
import { getAnvilLogs } from "@/lib/anvilProcess";

export async function GET() {
    return NextResponse.json({ logs: getAnvilLogs() });
}
