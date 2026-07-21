import { Client } from "@notionhq/client";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Integration, Item } from "@/lib/types";
import {
  EFFORT_FROM_NOTION_LABEL,
  EFFORT_NOTION_LABELS,
  PRIORITY_FROM_NOTION_LABEL,
  PRIORITY_NOTION_LABELS,
  TASK_STATUS_FROM_NOTION_LABEL,
  TASK_STATUS_NOTION_LABELS,
  CATEGORY_OPTIONS,
  RECURRING_CATEGORY_NOTION_TAG,
} from "@/lib/itemPresentation";
import { formatRecurrenceSchedule } from "@/lib/recurrence";
import type { Category, Effort, Priority, TaskStatus } from "@/lib/types";

export const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
export const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

/**
 * Devuelve el access token de Notion del usuario. Los tokens de la
 * integración pública de Notion no expiran, por lo que no requieren refresh.
 */
export async function getNotionAccessToken(userId: string): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "notion")
    .single<Integration>();

  if (error || !integration) {
    throw new Error("El usuario no tiene conectada su cuenta de Notion");
  }

  return integration.access_token;
}

function getNotionClient(accessToken: string) {
  return new Client({ auth: accessToken });
}

/**
 * Desde la introducción de "data sources" en la API de Notion, las bases de
 * datos ya no exponen `properties` directamente: hay que resolver primero su
 * data source (asumimos la primera, caso normal de una base de datos simple).
 */
async function getDataSourceId(notion: Client, databaseId: string): Promise<string> {
  const database = await notion.databases.retrieve({ database_id: databaseId });
  const dataSources = (database as unknown as { data_sources?: { id: string }[] }).data_sources;

  if (!dataSources || dataSources.length === 0) {
    throw new Error("La base de datos de Notion no tiene ningún data source asociado");
  }

  return dataSources[0].id;
}

interface DataSourceProperty {
  type: string;
}

async function getDataSourceProperties(
  notion: Client,
  dataSourceId: string
): Promise<Record<string, DataSourceProperty>> {
  const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  return (dataSource as unknown as { properties: Record<string, DataSourceProperty> }).properties ?? {};
}

function getTitlePropertyName(properties: Record<string, DataSourceProperty>): string {
  const titleEntry = Object.entries(properties).find(([, value]) => value.type === "title");
  return titleEntry ? titleEntry[0] : "Name";
}

/**
 * Busca el primer usuario humano (no bot) del workspace de Notion, para
 * asignarlo automáticamente como "Responsable" de cada tarea.
 */
async function getWorkspaceOwnerId(notion: Client): Promise<string | null> {
  try {
    const { results } = await notion.users.list({});
    const person = results.find((u: { type?: string }) => u.type === "person");
    return person?.id ?? null;
  } catch (err) {
    console.error("No se pudo obtener el usuario del workspace de Notion:", err);
    return null;
  }
}

export interface NotionPageResult {
  pageId: string;
  url: string;
}

export type TaskItemFields = Pick<
  Item,
  | "title"
  | "description"
  | "type"
  | "start_time"
  | "end_time"
  | "priority"
  | "effort"
  | "task_status"
  | "categories"
  | "location"
  | "recurrence_days"
  | "recurrence_start_time"
  | "recurrence_end_time"
> & { due_date?: string | null };

/**
 * Arma el objeto `properties` para crear/actualizar una página, mapeando
 * solo las columnas que existen en el data source del usuario y que tienen
 * un valor en el item. "Con retraso" es una fórmula de Notion y nunca se
 * escribe.
 */
function buildTaskProperties(
  properties: Record<string, DataSourceProperty>,
  titleProperty: string,
  item: Partial<TaskItemFields>,
  options: { ownerId?: string | null; outfitSuggestion?: string | null } = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (item.title !== undefined) {
    result[titleProperty] = { title: [{ text: { content: item.title } }] };
  }

  if (properties["Descripción"] && item.description !== undefined) {
    result["Descripción"] = {
      rich_text: item.description ? [{ type: "text", text: { content: item.description } }] : [],
    };
  }

  if (properties["fecha evento"] && item.start_time !== undefined) {
    result["fecha evento"] = item.start_time
      ? { date: { start: item.start_time, end: item.end_time ?? null } }
      : { date: null };
  }

  if (properties["Ubicación"] && item.location !== undefined) {
    result["Ubicación"] = {
      rich_text: item.location ? [{ type: "text", text: { content: item.location } }] : [],
    };
  }

  if (properties["Fecha límite"] && item.due_date !== undefined) {
    result["Fecha límite"] = item.due_date ? { date: { start: item.due_date } } : { date: null };
  }

  if (properties["Prioridad"] && item.priority !== undefined) {
    result["Prioridad"] = item.priority ? { select: { name: PRIORITY_NOTION_LABELS[item.priority] } } : { select: null };
  }

  if (properties["Nivel de esfuerzo"] && item.effort !== undefined) {
    result["Nivel de esfuerzo"] = item.effort
      ? { select: { name: EFFORT_NOTION_LABELS[item.effort] } }
      : { select: null };
  }

  if (properties["Estado"] && item.task_status !== undefined) {
    result["Estado"] = { status: { name: TASK_STATUS_NOTION_LABELS[item.task_status] } };
  }

  if (properties["Tipo de tarea"] && item.categories !== undefined) {
    result["Tipo de tarea"] = { multi_select: item.categories.map((name) => ({ name })) };
  }

  if (properties["Responsable"] && options.ownerId) {
    result["Responsable"] = { people: [{ id: options.ownerId }] };
  }

  if (properties["vestimenta"] && options.outfitSuggestion) {
    result["vestimenta"] = { rich_text: [{ type: "text", text: { content: options.outfitSuggestion } }] };
  }

  if (properties["rutina"] && item.recurrence_days !== undefined) {
    const tags = (item.categories ?? [])
      .map((c) => RECURRING_CATEGORY_NOTION_TAG[c])
      .filter((t): t is string => Boolean(t));
    const finalTags = item.recurrence_days.length > 0 ? (tags.length > 0 ? tags : ["rutina"]) : [];
    result["rutina"] = { multi_select: finalTags.map((name) => ({ name })) };
  }

  if (properties["fechas"] && item.recurrence_days !== undefined) {
    const scheduleText = formatRecurrenceSchedule(
      item.recurrence_days,
      item.recurrence_start_time ?? null,
      item.recurrence_end_time ?? null
    );
    result["fechas"] = { rich_text: scheduleText ? [{ type: "text", text: { content: scheduleText } }] : [] };
  }

  return result;
}

/**
 * Crea una página de Notion para un item dentro de la base de datos
 * configurada por el usuario (`profiles.notion_database_id`).
 */
export async function createItemNotionPage(
  accessToken: string,
  databaseId: string,
  item: TaskItemFields,
  options: { outfitSuggestion?: string | null } = {}
): Promise<NotionPageResult> {
  const notion = getNotionClient(accessToken);
  const dataSourceId = await getDataSourceId(notion, databaseId);
  const properties = await getDataSourceProperties(notion, dataSourceId);
  const titleProperty = getTitlePropertyName(properties);
  const ownerId = await getWorkspaceOwnerId(notion);

  const response = await notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties: buildTaskProperties(properties, titleProperty, item, {
      ownerId,
      outfitSuggestion: options.outfitSuggestion,
    }) as Parameters<typeof notion.pages.create>[0]["properties"],
    children: item.description
      ? [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: item.description } }],
            },
          },
        ]
      : [],
  });

  const page = response as unknown as { id: string; url: string };
  return { pageId: page.id, url: page.url };
}

export async function updateItemNotionPage(
  accessToken: string,
  pageId: string,
  databaseId: string,
  item: Partial<TaskItemFields>,
  options: { outfitSuggestion?: string | null } = {}
): Promise<void> {
  const notion = getNotionClient(accessToken);
  const dataSourceId = await getDataSourceId(notion, databaseId);
  const properties = await getDataSourceProperties(notion, dataSourceId);
  const titleProperty = getTitlePropertyName(properties);

  await notion.pages.update({
    page_id: pageId,
    properties: buildTaskProperties(properties, titleProperty, item, {
      outfitSuggestion: options.outfitSuggestion,
    }) as Parameters<typeof notion.pages.update>[0]["properties"],
  });
}

export interface RemoteNotionPage {
  pageId: string;
  url: string;
  title: string;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  priority: Priority | null;
  effort: Effort | null;
  taskStatus: TaskStatus | null;
  categories: Category[];
}

function richTextToPlain(richText: unknown): string {
  if (!Array.isArray(richText)) return "";
  return richText.map((part) => (part as { plain_text?: string }).plain_text ?? "").join("");
}

/**
 * Lista páginas de la base de datos del usuario que tengan "fecha evento"
 * llena (para detectar tareas creadas/editadas directo en Notion, fuera de
 * la app). Ignora páginas sin esa fecha (filas de ejemplo de la plantilla).
 */
export async function listNotionPagesWithEventDate(
  accessToken: string,
  databaseId: string
): Promise<RemoteNotionPage[]> {
  const notion = getNotionClient(accessToken);
  const dataSourceId = await getDataSourceId(notion, databaseId);
  const properties = await getDataSourceProperties(notion, dataSourceId);
  const titleProperty = getTitlePropertyName(properties);

  if (!properties["fecha evento"]) return [];

  const pages: RemoteNotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: { property: "fecha evento", date: { is_not_empty: true } },
      start_cursor: cursor,
    });

    for (const page of response.results as unknown as {
      id: string;
      url: string;
      properties: Record<string, unknown>;
    }[]) {
      const props = page.properties as Record<string, { type: string } & Record<string, unknown>>;

      const titleProp = props[titleProperty];
      const title = richTextToPlain(titleProp?.title) || "(sin título)";

      const descriptionProp = properties["Descripción"] ? props["Descripción"] : undefined;
      const description = descriptionProp ? richTextToPlain(descriptionProp.rich_text) || null : null;

      const dateProp = props["fecha evento"] as unknown as {
        date: { start: string; end: string | null } | null;
      };
      const start = dateProp.date?.start ?? null;
      const end = dateProp.date?.end ?? null;
      if (!start) continue;
      const allDay = !start.includes("T");

      const priorityName = (props["Prioridad"] as { select?: { name: string } | null })?.select?.name;
      const effortName = (props["Nivel de esfuerzo"] as { select?: { name: string } | null })?.select?.name;
      const statusName = (props["Estado"] as { status?: { name: string } | null })?.status?.name;
      const categoryOptions = ((props["Tipo de tarea"] as { multi_select?: { name: string }[] })?.multi_select ?? [])
        .map((o) => o.name)
        .filter((name): name is Category => (CATEGORY_OPTIONS as string[]).includes(name));

      pages.push({
        pageId: page.id,
        url: page.url,
        title,
        description,
        startTime: start,
        endTime: end,
        allDay,
        priority: priorityName ? PRIORITY_FROM_NOTION_LABEL[priorityName] ?? null : null,
        effort: effortName ? EFFORT_FROM_NOTION_LABEL[effortName] ?? null : null,
        taskStatus: statusName ? TASK_STATUS_FROM_NOTION_LABEL[statusName] ?? null : null,
        categories: categoryOptions,
      });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

/**
 * Notion no permite borrar páginas vía API; se archivan (equivalente a
 * moverlas a la papelera).
 */
export async function archiveItemNotionPage(accessToken: string, pageId: string): Promise<void> {
  const notion = getNotionClient(accessToken);

  try {
    await notion.pages.update({ page_id: pageId, archived: true });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status !== 404) {
      throw err;
    }
  }
}
