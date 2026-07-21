import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import type { Goal } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  due_date: z.string().datetime().optional().nullable(),
  recurrence_type: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
  categories: z
    .array(z.enum(["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro"]))
    .optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const userId = await requireUser(request);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const service = createServiceRoleClient();

  const patchData = {
    ...parsed.data,
    ...(parsed.data.description !== undefined ? { description: encrypt(parsed.data.description) } : {}),
  };

  const { data, error } = await service
    .from("goals")
    .update(patchData)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single<Goal>();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "No encontrado" }, { status: 404 });

  return NextResponse.json({ goal: { ...data, description: decrypt(data.description) } });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const userId = await requireUser(request);
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const service = createServiceRoleClient();
  const { error } = await service
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
