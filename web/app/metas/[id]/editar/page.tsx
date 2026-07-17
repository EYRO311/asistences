import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { EditGoalForm } from "@/components/EditGoalForm";
import type { Goal } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditGoalPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .single<Goal>();

  if (!goal) {
    notFound();
  }

  const decryptedGoal: Goal = { ...goal, description: decrypt(goal.description) };

  return (
    <main className="mx-auto w-full max-w-xl flex-1 lg:max-w-2xl px-4 py-8">
      <h1 className="font-handwriting text-3xl mb-6">Editar meta</h1>
      <EditGoalForm goal={decryptedGoal} />
    </main>
  );
}
