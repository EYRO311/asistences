import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken, fetchInboxEmails } from "@/lib/google";

export async function GET(request: NextRequest) {
  // Auth: cookie session (web) OR Bearer token (mobile)
  let userId: string | undefined;
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const service = createServiceRoleClient();
    const { data } = await service.auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
  }

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
