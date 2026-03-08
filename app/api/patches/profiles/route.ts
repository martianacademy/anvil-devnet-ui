import { NextResponse } from "next/server";
import { getAllProfiles, saveProfile, deleteProfile, setActiveProfile, PROFILE_PRESETS } from "@/lib/chainProfiles";

export async function GET() {
    return NextResponse.json({ profiles: getAllProfiles(), presets: PROFILE_PRESETS });
}

export async function POST(req: Request) {
    try {
        const profile = await req.json();
        saveProfile(profile);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { name } = await req.json();
        deleteProfile(name);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const { name } = await req.json();
        setActiveProfile(name);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
