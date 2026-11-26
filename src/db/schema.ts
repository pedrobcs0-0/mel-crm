import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Nível de evidência da origem do contato (regra do produto). */
export const originEvidence = pgEnum("origin_evidence", [
  "confirmada", // rastreio técnico (ex.: referral de anúncio do WhatsApp)
  "declarada", // o próprio paciente disse
  "inferida", // deduzida de pistas indiretas
  "desconhecida",
]);

export const messageSender = pgEnum("message_sender", [
  "paciente",
  "ia",
  "humano",
  "sistema",
]);

export const appointmentStatus = pgEnum("appointment_status", [
  "pendente",
  "confirmada",
  "recusada",
]);

export const usageStatus = pgEnum("usage_status", ["ok", "erro", "bloqueado"]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  phone: text("phone"),
  origin: text("origin"),
  originDetail: text("origin_detail"),
  originEvidence: originEvidence("origin_evidence").notNull().default("desconhecida"),
  isTest: boolean("is_test").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    /** IA só responde quando true. Assumir por humano desliga até reativação explícita. */
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    needsHuman: boolean("needs_human").notNull().default(false),
    needsHumanReason: text("needs_human_reason"),
    /** Trava simples para não haver duas respostas da IA ao mesmo tempo. */
    aiBusyUntil: timestamp("ai_busy_until", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_last_idx").on(t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    sender: messageSender("sender").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const appointmentRequests = pgTable("appointment_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  patientName: text("patient_name"),
  procedure: text("procedure"),
  preferredPeriod: text("preferred_period"),
  notes: text("notes"),
  urgent: boolean("urgent").notNull().default(false),
  status: appointmentStatus("status").notNull().default("pendente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    status: usageStatus("status").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

/** Linha única (id = 1) com as configurações de consumo. */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  dailyLimitUsd: numeric("daily_limit_usd", { precision: 8, scale: 2, mode: "number" }).notNull().default(1),
  monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 8, scale: 2, mode: "number" }).notNull().default(10),
  aiPaused: boolean("ai_paused").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AppointmentRequest = typeof appointmentRequests.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
export type Settings = typeof settings.$inferSelect;
