import { and, asc, desc, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function listConversations() {
  const lastMsg = db
    .select({
      conversationId: schema.messages.conversationId,
      content: schema.messages.content,
      sender: schema.messages.sender,
      rn: dsql<number>`row_number() over (partition by ${schema.messages.conversationId} order by ${schema.messages.createdAt} desc)`.as("rn"),
    })
    .from(schema.messages)
    .as("lm");

  return db
    .select({
      id: schema.conversations.id,
      aiEnabled: schema.conversations.aiEnabled,
      needsHuman: schema.conversations.needsHuman,
      lastMessageAt: schema.conversations.lastMessageAt,
      contactName: schema.contacts.name,
      contactPhone: schema.contacts.phone,
      lastContent: lastMsg.content,
      lastSender: lastMsg.sender,
    })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .leftJoin(lastMsg, and(eq(lastMsg.conversationId, schema.conversations.id), eq(lastMsg.rn, 1)))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(200);
}
export type ConversationListItem = Awaited<ReturnType<typeof listConversations>>[number];

export async function getConversationDetail(id: string) {
  const [row] = await db
    .select({ conversation: schema.conversations, contact: schema.contacts })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(eq(schema.conversations.id, id));
  if (!row) return null;
  const [msgs, requests] = await Promise.all([
    db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(asc(schema.messages.createdAt)),
    db.select().from(schema.appointmentRequests).where(eq(schema.appointmentRequests.conversationId, id)).orderBy(desc(schema.appointmentRequests.createdAt)),
  ]);
  const [cost] = await db
    .select({ total: dsql<string>`coalesce(sum(${schema.aiUsage.costUsd}),0)` })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.conversationId, id));
  return { ...row, messages: msgs, requests, costUsd: Number(cost?.total ?? 0) };
}
export type ConversationDetail = NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;
