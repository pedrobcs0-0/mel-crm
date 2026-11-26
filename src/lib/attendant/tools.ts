import { z } from "zod";
import type { ToolDefinition } from "../ai/types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "solicitar_agendamento",
    description:
      "Registra uma SOLICITAÇÃO de agendamento para a equipe confirmar. Não confirma horário. Use quando o paciente quiser marcar consulta/avaliação e você já souber o procedimento de interesse e a preferência de dia/período.",
    parameters: {
      type: "object",
      properties: {
        nome_paciente: { type: "string", description: "Nome do paciente, se informado" },
        procedimento: { type: "string", description: "Procedimento ou motivo da consulta" },
        periodo_preferido: { type: "string", description: "Preferência de dia/período, como o paciente disse" },
        observacoes: { type: "string", description: "Detalhes úteis para a equipe" },
        urgente: { type: "boolean", description: "true se houver dor forte, inchaço, sangramento ou trauma" },
      },
      required: ["procedimento", "periodo_preferido", "urgente"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_contato",
    description:
      "Atualiza o cadastro do contato com o nome e/ou a origem que o PRÓPRIO paciente declarou (ex.: Instagram, Google, indicação de alguém, passou na frente).",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do paciente" },
        origem: {
          type: "string",
          enum: ["instagram", "google", "indicacao", "facebook", "passou_na_frente", "ja_e_paciente", "outro"],
          description: "Canal de origem declarado",
        },
        origem_detalhe: { type: "string", description: "Detalhe, ex.: quem indicou" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "transferir_para_humano",
    description:
      "Passa a conversa para a equipe humana e desativa a IA nesta conversa. Use quando não souber responder, o paciente pedir uma pessoa, reclamar ou o assunto for sensível.",
    parameters: {
      type: "object",
      properties: { motivo: { type: "string", description: "Motivo resumido para a equipe" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

const s = (max: number) => z.string().trim().max(max);

export const toolSchemas = {
  solicitar_agendamento: z.object({
    nome_paciente: s(120).optional(),
    procedimento: s(200),
    periodo_preferido: s(200),
    observacoes: s(1000).optional(),
    urgente: z.boolean(),
  }),
  registrar_contato: z.object({
    nome: s(120).optional(),
    origem: z.enum(["instagram", "google", "indicacao", "facebook", "passou_na_frente", "ja_e_paciente", "outro"]).optional(),
    origem_detalhe: s(200).optional(),
  }),
  transferir_para_humano: z.object({ motivo: s(500) }),
};

export type ToolName = keyof typeof toolSchemas;
