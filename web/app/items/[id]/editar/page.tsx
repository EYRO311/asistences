import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditItemForm } from "@/components/EditItemForm";
import type { Item } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditItemPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .single<Item>();

  if (!item) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 lg:max-w-2xl px-4 py-8">
      <h1 className="font-handwriting text-3xl mb-6">Editar tarea</h1>
      <EditItemForm item={item} />
    </main>
  );
}
