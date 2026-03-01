import { NextResponse } from "next/server";

export function ok(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
export function badRequest(message: string, extra?: any) {
  return NextResponse.json({ error: "BAD_REQUEST", message, ...extra }, { status: 400 });
}
export function serverError(message: string) {
  return NextResponse.json({ error: "SERVER_ERROR", message }, { status: 500 });
}
