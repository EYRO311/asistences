import {
  createItemNotionPage,
  updateItemNotionPage,
  type NotionPageResult,
  type TaskItemFields,
} from "@/lib/notion";
import { decrypt } from "@/lib/crypto";

// Fase 3 del plan de implementación — objetivo: que ningún caller nuevo
// pueda "olvidarse" de desencriptar description/location antes de mandarlos
// a Notion. Antes, cada caller (el saga de creación, el PATCH de items) era
// responsable de calcular `plainDescription`/`plainLocation` a mano y
// acordarse de pasarlos en vez del item crudo — un olvido ahí guardaría
// texto cifrado en Notion (ya pasó una vez, ver commit de la sesión donde
// se corrigió).
//
// Estas dos funciones son ahora el ÚNICO punto de entrada para
// crear/actualizar una página de Notion desde un item: reciben el item TAL
// COMO viene de la base de datos (description/location posiblemente
// cifrados) y desencriptan internamente antes de llamar a los helpers de
// bajo nivel en web/lib/notion.ts. decrypt() es un no-op seguro sobre texto
// que ya está en claro (items importados de Google/Notion nunca se cifran),
// así que es seguro llamarlas siempre, sin que el caller tenga que saber en
// qué estado viene el item.

function decryptForNotion<T extends Partial<Pick<TaskItemFields, "description" | "location">>>(
  item: T
): T {
  return {
    ...item,
    description: item.description !== undefined ? decrypt(item.description) : item.description,
    location: item.location !== undefined ? decrypt(item.location) : item.location,
  };
}

export async function createNotionPageForItem(
  accessToken: string,
  databaseId: string,
  item: TaskItemFields,
  options: { outfitSuggestion?: string | null } = {}
): Promise<NotionPageResult> {
  return createItemNotionPage(accessToken, databaseId, decryptForNotion(item), options);
}

export async function updateNotionPageForItem(
  accessToken: string,
  pageId: string,
  databaseId: string,
  item: Partial<TaskItemFields>,
  options: { outfitSuggestion?: string | null } = {}
): Promise<void> {
  return updateItemNotionPage(accessToken, pageId, databaseId, decryptForNotion(item), options);
}
