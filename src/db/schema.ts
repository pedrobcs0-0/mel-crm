import {
  boolean,
  jsonb,
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
  /** Memória: resumo do que já sabemos sobre a necessidade do paciente (mantido pela IA). */
  summary: text("summary"),
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
    /** Para mensagens da IA: análise interna e ações registradas (não enviadas ao paciente). */
    meta: jsonb("meta").$type<MessageMeta>(),
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

export const crmEventType = pgEnum("crm_event_type", ["objecao", "oportunidade"]);

/** Eventos comerciais registrados pela IA (objeções declaradas, oportunidades de acompanhamento). */
export const crmEvents = pgTable(
  "crm_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    type: crmEventType("type").notNull(),
    category: text("category"),
    description: text("description").notNull(),
    when: text("when_hint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_events_contact_idx").on(t.contactId)],
);

/** Seções editáveis do comportamento da atendente (a camada protegida fica no código). */
export const promptSections = pgTable("prompt_sections", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptSectionVersions = pgTable(
  "prompt_section_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    content: text("content").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("psv_key_idx").on(t.key, t.createdAt)],
);

export const feedbackStatus = pgEnum("feedback_status", ["nova", "analisada", "descartada"]);

/** Correções feitas no laboratório: resposta ruim + motivo + resposta melhor. */
export const responseFeedback = pgTable("response_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  /** Trecho da conversa até a resposta avaliada, para dar contexto às propostas. */
  context: text("context").notNull(),
  badResponse: text("bad_response").notNull(),
  reason: text("reason").notNull(),
  betterResponse: text("better_response"),
  status: feedbackStatus("status").notNull().default("nova"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Propostas de melhoria geradas a partir das correções. Só viram regra quando aplicadas por uma pessoa. */
export const behaviorProposals = pgTable("behavior_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  summary: text("summary").notNull(),
  changes: jsonb("changes").$type<ProposalChange[]>().notNull(),
  feedbackIds: jsonb("feedback_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface ProposalChange {
  secao: string;
  justificativa: string;
  novo_conteudo: string;
  aplicada?: boolean;
}

export interface MessageMeta {
  analise?: Record<string, unknown>;
  acoes?: string[];
}

export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AppointmentRequest = typeof appointmentRequests.$inferSelect;
export type AiUsage = typeof aiUsage.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type CrmEvent = typeof crmEvents.$inferSelect;
export type ResponseFeedback = typeof responseFeedback.$inferSelect;
export type BehaviorProposal = typeof behaviorProposals.$inferSelect;
