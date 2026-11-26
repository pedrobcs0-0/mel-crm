import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { pg?: Sql; db?: PostgresJsDatabase<typeof schema> };

/** Conexão criada só no primeiro uso, para o build funcionar sem DATABASE_URL. */
function getSql(): Sql {
  if (!g.pg) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    // prepare:false é necessário com poolers (Neon/PgBouncer) e inofensivo localmente.
    g.pg = postgres(url, { max: 5, prepare: false });
  }
  return g.pg;
}

function getDb() {
  if (!g.db) g.db = drizzle(getSql(), { schema });
  return g.db;
}

function lazy<T extends object>(get: () => T): T {
  return new Proxy(function () {} as unknown as T, {
    get: (_t, p) => {
      const target = get() as Record<PropertyKey, unknown>;
      const v = target[p];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    apply: (_t, _this, args) => (get() as unknown as (...a: unknown[]) => unknown)(...args),
  });
}

export const db = lazy(getDb);
export const sql = lazy(getSql);
export { schema };
