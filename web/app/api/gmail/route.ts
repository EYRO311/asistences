import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken, fetchInboxEmails } from "@/lib/google";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const accessToken = await getValidGoogleAccessToken(user.id);
    const emails = await fetchInboxEmails(accessToken, 8);
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[gmail] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ emails: [] });
  }
}
