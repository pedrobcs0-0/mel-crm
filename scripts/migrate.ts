import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL ausente; pulando migrações.");
    return;
  }
  const sql = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql`insert into settings (id) values (1) on conflict (id) do nothing`;
  await sql.end();
  console.log("[migrate] banco atualizado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
