import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateProfileSchema = z.object({
  notion_database_id: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  full_name: z.string().min(1).optional(),
  age: z.number().int().min(0).max(120).nullable().optional(),
  gender: z.enum(["masculino", "femenino", "no_binario", "prefiero_no_decir"]).nullable().optional(),
  location: z.string().optional(),
  preferred_transport: z.enum(["car", "bike", "public_transport", "walking"]).nullable().optional(),
  extra_buffer_minutes: z.number().int().min(0).max(120).optional(),
  theme: z.enum(["light", "dark"]).nullable().optional(),
  wake_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sleep_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: integrations } = await supabase
    .from("integrations")
    .select("provider, workspace_id, metadata")
    .eq("user_id", user.id);

  return NextResponse.json({ profile, integrations: integrations ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
