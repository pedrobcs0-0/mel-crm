import type { AppointmentRequest, Contact, CrmEvent } from "@/db/schema";
import { ORIGIN_LABEL } from "../format";
import { OUTPUT_CONTRACT, PROTECTED_RULES } from "./behavior/protected";
import type { SectionContent } from "./behavior/sections";

/**
 * Parte estática do prompt (identidade, comunicação, estratégia, base, regras).
 * Fica no início e igual entre turnos para aproveitar o cache de prompt da OpenAI.
 */
export function buildSystemPrompt(sections: Pick<SectionContent, "key" | "title" | "content">[]): string {
  const body = sections.map((s) => `## ${s.title}\n${s.content.trim()}`).join("\n\n");
  return `Você atende pacientes pelo WhatsApp em nome do consultório odontológico da Dra. Mel.

${PROTECTED_RULES}

${body}

${OUTPUT_CONTRACT}`;
}

/** Parte dinâmica: o que já sabemos do contato e o momento atual. Vai no fim, logo antes da resposta. */
export function buildContextMessage(input: {
  contact: Contact;
  requests: AppointmentRequest[];
  events: CrmEvent[];
  isFirstReply: boolean;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const when = now.toLocaleString("pt-BR", {
    timeZone: "America/Cuiaba",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const c = input.contact;
  const lines = [
    `Agora: ${when} (horário de Cuiabá).`,
    input.isFirstReply ? "Esta é a sua primeira resposta nesta conversa." : "Você já se apresentou nesta conversa; não se apresente de novo.",
    `Nome do contato: ${c.name ? `${c.name} (pode ser só o nome do perfil do WhatsApp)` : "desconhecido"}.`,
    `Origem: ${c.origin ? `${ORIGIN_LABEL[c.origin] ?? c.origin} (${c.originEvidence})` : "desconhecida"}.${c.originEvidence === "confirmada" ? " Já sabemos a origem: não pergunte como conheceu o consultório." : ""}`,
    `Memória do que já sabemos: ${c.summary ?? "nada ainda."}`,
  ];
  const open = input.requests.filter((r) => r.status === "pendente");
  if (open.length)
    lines.push(
      `Solicitações de agendamento já registradas e aguardando a equipe: ${open.map((r) => `${r.procedure} (${r.preferredPeriod})`).join("; ")}. Não registre de novo a mesma solicitação.`,
    );
  if (input.events.length)
    lines.push(`Registros comerciais anteriores: ${input.events.map((e) => `${e.type} ${e.category ?? ""}: ${e.description}`).join("; ")}.`);
  return `Contexto interno (não mencionar ao paciente):\n${lines.map((l) => `- ${l}`).join("\n")}\n\nAnalise a última mensagem do paciente no contexto da conversa e responda.`;
}
