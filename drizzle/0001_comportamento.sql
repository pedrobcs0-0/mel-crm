CREATE TYPE "public"."crm_event_type" AS ENUM('objecao', 'oportunidade');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('nova', 'analisada', 'descartada');--> statement-breakpoint
CREATE TABLE "behavior_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb NOT NULL,
	"feedback_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"conversation_id" uuid,
	"type" "crm_event_type" NOT NULL,
	"category" text,
	"description" text NOT NULL,
	"when_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_section_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_sections" (
	"key" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"context" text NOT NULL,
	"bad_response" text NOT NULL,
	"reason" text NOT NULL,
	"better_response" text,
	"status" "feedback_status" DEFAULT 'nova' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "crm_events" ADD CONSTRAINT "crm_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_events" ADD CONSTRAINT "crm_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_feedback" ADD CONSTRAINT "response_feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_feedback" ADD CONSTRAINT "response_feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_events_contact_idx" ON "crm_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "psv_key_idx" ON "prompt_section_versions" USING btree ("key","created_at");