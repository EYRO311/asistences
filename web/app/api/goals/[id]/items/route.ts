import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";
import type { GoalItem } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const createItemSchema = z.object({
  title: z.string().min(1),
  order_index: z.number().int().optional(),
});

const updateItemSchema = z.object({
  item_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
  order_index: z.number().int().optional(),
});

function decryptItem(item: GoalItem): GoalItem {
  return { ...item, title: decrypt(item.title) ?? item.title };
}

async function verifyGoalOwner(goalId: string, userId: string): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data } = await service.from("goals").select("id").eq("id", goalId).eq("user_id", userId).single();
  return !!data;
}

// GET /api/goals/[id]/items — lista checklist items de una meta
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!await verifyGoalOwner(goalId, user.id)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("goal_items")
    .select("*")
    .eq("goal_id", goalId)
    .order("order_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: (data as GoalItem[]).map(decryptItem) });
}

// POST /api/goals/[id]/items — agrega un item al checklist
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!await verifyGoalOwner(goalId, user.id)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("goal_items")
    .insert({
      goal_id: goalId,
      title: encrypt(parsed.data.title),
      order_index: parsed.data.order_index ?? 0,
    })
    .select("*")
    .single<GoalItem>();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Error al crear" }, { status: 500 });

  return NextResponse.json({ item: decryptItem(data) }, { status: 201 });
}

// PATCH /api/goals/[id]/items — actualiza un item (completar, renombrar, reordenar)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!await verifyGoalOwner(goalId, user.id)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { item_id, ...rest } = parsed.data;
  const service = createServiceRoleClient();

  const patchData: Record<string, unknown> = {
    ...rest,
    ...(rest.title !== undefined ? { title: encrypt(rest.title) } : {}),
    ...(rest.completed === true ? { completed_at: new Date().toISOString() } : {}),
    ...(rest.completed === false ? { completed_at: null } : {}),
  };

  const { data, error } = await service
    .from("goal_items")
    .update(patchData)
    .eq("id", item_id)
    .eq("goal_id", goalId)
    .select("*")
    .single<GoalItem>();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "No encontrado" }, { status: 404 });

  return NextResponse.json({ item: decryptItem(data) });
}

// DELETE /api/goals/[id]/items?item_id=xxx
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!await verifyGoalOwner(goalId, user.id)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const itemId = request.nextUrl.searchParams.get("item_id");
  if (!itemId) return NextResponse.json({ error: "item_id requerido" }, { status: 400 });

  const service = createServiceRoleClient();
  const { error } = await service
    .from("goal_items")
    .delete()
    .eq("id", itemId)
    .eq("goal_id", goalId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
