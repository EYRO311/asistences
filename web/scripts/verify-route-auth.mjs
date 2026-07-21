#!/usr/bin/env node
// Fase 2 del plan de implementación: guardia estática para "rutas nuevas" —
// falla si un archivo route.ts usa createServiceRoleClient() (que salta RLS
// por completo) sin ninguna evidencia de haber autenticado la petición
// primero. No reemplaza la revisión de que cada query esté además filtrada
// por user_id (eso se revisó a mano en esta fase), pero sí evita el error
// más peligroso: usar el cliente privilegiado sin haber verificado quién
// pregunta.
//
// Uso: node scripts/verify-route-auth.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROUTES_ROOT = join(import.meta.dirname, "..", "app", "api");

// Rutas con un flujo de autenticación legítimamente distinto al helper
// compartido — no reinventan la validación por descuido, la diseñaron así:
//  - signout: no hay user_id que proteger, solo cierra la sesión actual.
//  - auth/*/connect: inicia el flujo OAuth; valida sesión de cookie O un
//    token de mobile pasado por query param (no puede usar Authorization
//    header porque es una navegación de browser, no un fetch).
//  - auth/*/callback: no hay sesión que verificar (puede ser un browser
//    externo sin cookies, en el caso de mobile) — la seguridad viene de que
//    `state` está firmado (ver web/lib/oauthState.ts), no de una sesión viva.
//  - push/send-due: la llama un cron externo (no un usuario) para revisar A
//    TODOS los usuarios con recordatorios activos, así que no hay un solo
//    user_id que autenticar — se protege con CRON_SECRET (comparación
//    timing-safe) en vez de requireUser/getUser.
const EXEMPT = new Set([
  "auth/signout/route.ts",
  "auth/google/connect/route.ts",
  "auth/google/callback/route.ts",
  "auth/notion/connect/route.ts",
  "auth/notion/callback/route.ts",
  "push/send-due/route.ts",
]);

function findRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

const routeFiles = findRouteFiles(ROUTES_ROOT);
if (routeFiles.length === 0) {
  console.error("No se encontraron rutas en app/api — ¿corriste esto desde web/?");
  process.exit(1);
}

let failures = 0;
let checked = 0;

for (const file of routeFiles) {
  const relPath = relative(ROUTES_ROOT, file).replace(/\\/g, "/");
  if (EXEMPT.has(relPath)) {
    console.log(`… ${relPath} (exenta: flujo de auth propio, ver comentario en el script)`);
    continue;
  }

  const content = readFileSync(file, "utf8");
  const usesServiceRole = content.includes("createServiceRoleClient");
  const usesRequireUser = content.includes("requireUser");
  const usesGetUser = content.includes(".auth.getUser(");

  checked++;

  if (usesServiceRole && !usesRequireUser && !usesGetUser) {
    console.error(`✗ ${relPath}: usa createServiceRoleClient() sin ninguna verificación de usuario visible`);
    failures++;
    continue;
  }

  const pattern = usesRequireUser ? "requireUser (compartido)" : usesGetUser ? "getUser() + RLS (cookie propio)" : "sin service-role, no aplica";
  console.log(`✓ ${relPath} — ${pattern}`);
}

console.log(`\n${checked} ruta(s) revisada(s), ${EXEMPT.size} exenta(s).`);

if (failures > 0) {
  console.error(`${failures} ruta(s) usan el cliente privilegiado sin autenticar. Corrígelas antes de continuar.`);
  process.exit(1);
}

console.log("Todas las rutas verifican al usuario antes de usar el cliente service-role.");
