import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getValidGoogleAccessToken, fetchInboxEmails } from "@/lib/google";

export async function GET(request: NextRequest) {
  const userId = await requireUser(request);
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const accessToken = await getValidGoogleAccessToken(userId);
    const emails = await fetchInboxEmails(accessToken, 8);
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[gmail]", err instanceof Error ? err.message : err);
    return NextResponse.json({ emails: [] });
  }
}
