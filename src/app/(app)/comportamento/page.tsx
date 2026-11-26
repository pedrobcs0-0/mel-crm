import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { BehaviorView } from "@/components/behavior-view";
import { PROTECTED_RULES } from "@/lib/attendant/behavior/protected";
import { loadSections } from "@/lib/attendant/behavior/sections";

export const dynamic = "force-dynamic";

export default async function ComportamentoPage() {
  const [sections, feedback, proposals] = await Promise.all([
    loadSections(),
    db.select().from(schema.responseFeedback).orderBy(desc(schema.responseFeedback.createdAt)).limit(100),
    db.select().from(schema.behaviorProposals).orderBy(desc(schema.behaviorProposals.createdAt)).limit(10),
  ]);
  return (
    <BehaviorView
      sections={JSON.parse(JSON.stringify(sections))}
      feedback={JSON.parse(JSON.stringify(feedback))}
      proposals={JSON.parse(JSON.stringify(proposals))}
      protectedRules={PROTECTED_RULES}
    />
  );
}
