import { NextResponse } from "next/server";

export function apiResponse(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}
