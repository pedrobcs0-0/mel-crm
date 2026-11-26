import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { SECTIONS, sectionDef } from "./defaults";

export type SectionContent = { key: string; title: string; help: string; content: string; isDefault: boolean; updatedAt: Date | null };

export async function loadSections(): Promise<SectionContent[]> {
  const rows = await db.select().from(schema.promptSections).orderBy(asc(schema.promptSections.key));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SECTIONS.map((s) => {
    const r = byKey.get(s.key);
    return { key: s.key, title: s.title, help: s.help, content: r?.content ?? s.defaultContent, isDefault: !r, updatedAt: r?.updatedAt ?? null };
  });
}

/** Salva uma seção e guarda a versão anterior no histórico. */
export async function saveSection(key: string, content: string, note: string) {
  if (!sectionDef(key)) throw new Error("Seção desconhecida");
  await db.transaction(async (tx) => {
    await tx.insert(schema.promptSectionVersions).values({ key, content, note });
    await tx
      .insert(schema.promptSections)
      .values({ key, content, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.promptSections.key, set: { content, updatedAt: new Date() } });
  });
}

export async function sectionHistory(key: string) {
  return db
    .select()
    .from(schema.promptSectionVersions)
    .where(eq(schema.promptSectionVersions.key, key))
    .orderBy(desc(schema.promptSectionVersions.createdAt))
    .limit(20);
}
