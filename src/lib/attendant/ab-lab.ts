import type { AppointmentRequest, Contact, CrmEvent } from "@/db/schema";
import type { ChatMessage } from "../ai/types";
import { buildContextMessage } from "./prompt";
import type { AttendantResponse } from "./response";

export type LabTurn = { patient: string; reply: AttendantResponse };
export function buildLabContext(turns: readonly LabTurn[], now: Date) {
  const contact: Contact = {
    id: "lab-contact", name: null, phone: null, origin: null, originDetail: null,
    originEvidence: "desconhecida", isTest: true, summary: null, createdAt: now,
  };
  const requests: AppointmentRequest[] = [];
  const events: CrmEvent[] = [];
  const history: ChatMessage[] = [];
  for (const { patient, reply } of turns) {
    history.push({ role: "user", content: patient });
    for (const content of reply.mensagens) if (content) history.push({ role: "assistant", content });
    const a = reply.acoes;
    if (a.contato?.nome) contact.name = a.contato.nome;
    if (a.contato?.origem) {
      contact.origin = a.contato.origem; contact.originDetail = a.contato.origem_detalhe; contact.originEvidence = "declarada";
    }
    if (a.memoria) contact.summary = a.memoria;
    if (a.solicitar_agendamento) {
      const ag = a.solicitar_agendamento;
      requests[0] = { id: "lab-request", conversationId: "lab", patientName: ag.nome_paciente || contact.name,
        procedure: ag.procedimento, preferredPeriod: ag.periodo_preferido, notes: ag.observacoes,
        urgent: ag.urgente, status: "pendente", createdAt: now };
    }
    if (a.objecao && !events.some(e => e.type === "objecao" && e.category === a.objecao?.tipo)) {
      events.push({ id: "lab-event-"+events.length, contactId: contact.id, conversationId: "lab",
        type: "objecao", category: a.objecao.tipo, description: a.objecao.descricao, when: null, createdAt: now });
    }
    if (a.oportunidade) {
      const existing = events.find(e => e.type === "oportunidade");
      const value: CrmEvent = { id: existing?.id ?? "lab-event-"+events.length, contactId: contact.id,
        conversationId: "lab", type: "oportunidade", category: null, description: a.oportunidade.motivo,
        when: a.oportunidade.quando, createdAt: now };
      if (existing) events[events.indexOf(existing)] = value; else events.push(value);
    }
  }
  const context = buildContextMessage({contact, requests, events, isFirstReply: !history.some(m => m.role === "assistant"), now});
  return { history: history.slice(-39), context };
}
