import { NextResponse } from "next/server";

export function validateServiceKey(request: Request): boolean {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return token === process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
