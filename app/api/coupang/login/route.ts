import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    return NextResponse.json({
        error: "Deprecated",
        message: "ID/PW login is disabled. Use Open API Key instead."
    }, { status: 403 });
}
