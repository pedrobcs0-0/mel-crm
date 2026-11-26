import { z } from "zod";

/** Contrato de saída estruturada: análise interna + mensagens + ações de CRM, numa única chamada. */
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const str = { type: "string" };
const nstr = { type: ["string", "null"] };

const ORIGENS = ["instagram", "google", "indicacao", "facebook", "passou_na_frente", "ja_e_paciente", "outro"] as const;
const OBJECOES = ["preco", "pesquisando_outros", "medo", "tempo", "distancia", "decisao_compartilhada", "confianca", "outro"] as const;
const MOMENTOS = ["abertura", "entendendo_necessidade", "duvida_informacao", "objecao", "decidindo", "agendando", "encerramento", "pos_agendamento", "fora_do_escopo"] as const;
const PERFIS = ["com_dor_ou_urgencia", "pesquisando", "inseguro", "preocupado_com_preco", "precisa_de_informacao", "decidido", "encerrando", "paciente_antigo", "indefinido"] as const;
const URGENCIAS = ["nenhuma", "possivel", "urgente", "grave"] as const;

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["analise", "mensagens", "acoes"],
  properties: {
    analise: {
      type: "object",
      additionalProperties: false,
      required: ["intencao", "momento", "perfil", "urgencia", "ja_sabemos", "relevante_descobrir", "objecao_ou_duvida", "paciente_pediu_valor", "proxima_intervencao", "deve_perguntar"],
      properties: {
        intencao: { ...str, description: "O que o paciente quer agora, em poucas palavras" },
        momento: { type: "string", enum: MOMENTOS },
        perfil: { type: "string", enum: PERFIS },
        urgencia: { type: "string", enum: URGENCIAS },
        ja_sabemos: { ...str, description: "O que já sabemos da necessidade (não perguntar de novo)" },
        relevante_descobrir: { ...str, description: "O que ainda vale entender, se algo; ou 'nada'" },
        objecao_ou_duvida: { ...nstr, description: "Objeção ou dúvida presente, se houver" },
        paciente_pediu_valor: { type: "boolean", description: "O paciente perguntou sobre valor/preço/pagamento nesta conversa?" },
        proxima_intervencao: { ...str, description: "A intervenção mais útil agora e por quê" },
        deve_perguntar: { type: "boolean", description: "Se uma pergunta ajuda agora ou se é melhor só responder" },
      },
    },
    mensagens: { type: "array", items: str, description: "0 a 2 mensagens curtas para o paciente" },
    acoes: {
      type: "object",
      additionalProperties: false,
      required: ["contato", "memoria", "solicitar_agendamento", "objecao", "oportunidade", "pendencia_equipe", "transferir"],
      properties: {
        contato: nullable({
          type: "object",
          additionalProperties: false,
          required: ["nome", "origem", "origem_detalhe"],
          properties: { nome: nstr, origem: { anyOf: [{ type: "string", enum: ORIGENS }, { type: "null" }] }, origem_detalhe: nstr },
        }),
        memoria: nstr,
        solicitar_agendamento: nullable({
          type: "object",
          additionalProperties: false,
          required: ["nome_paciente", "procedimento", "periodo_preferido", "observacoes", "urgente"],
          properties: { nome_paciente: nstr, procedimento: str, periodo_preferido: str, observacoes: nstr, urgente: { type: "boolean" } },
        }),
        objecao: nullable({
          type: "object",
          additionalProperties: false,
          required: ["tipo", "descricao"],
          properties: { tipo: { type: "string", enum: OBJECOES }, descricao: str },
        }),
        oportunidade: nullable({
          type: "object",
          additionalProperties: false,
          required: ["motivo", "quando"],
          properties: { motivo: str, quando: nstr },
        }),
        pendencia_equipe: nullable({ type: "object", additionalProperties: false, required: ["pergunta"], properties: { pergunta: str } }),
        transferir: nullable({ type: "object", additionalProperties: false, required: ["motivo"], properties: { motivo: str } }),
      },
    },
  },
} as const;

const t = (max: number) => z.string().trim().max(max);
const nt = (max: number) => t(max).nullable();

export const AttendantResponse = z.object({
  analise: z.object({
    intencao: t(500),
    momento: z.enum(MOMENTOS),
    perfil: z.enum(PERFIS),
    urgencia: z.enum(URGENCIAS),
    ja_sabemos: t(1000),
    relevante_descobrir: t(500),
    objecao_ou_duvida: nt(500),
    paciente_pediu_valor: z.boolean(),
    proxima_intervencao: t(500),
    deve_perguntar: z.boolean(),
  }),
  mensagens: z.array(t(1500)).max(3),
  acoes: z.object({
    contato: z.object({ nome: nt(120), origem: z.enum(ORIGENS).nullable(), origem_detalhe: nt(200) }).nullable(),
    memoria: nt(1500),
    solicitar_agendamento: z
      .object({ nome_paciente: nt(120), procedimento: t(200), periodo_preferido: t(200), observacoes: nt(1000), urgente: z.boolean() })
      .nullable(),
    objecao: z.object({ tipo: z.enum(OBJECOES), descricao: t(500) }).nullable(),
    oportunidade: z.object({ motivo: t(500), quando: nt(200) }).nullable(),
    pendencia_equipe: z.object({ pergunta: t(500) }).nullable(),
    transferir: z.object({ motivo: t(500) }).nullable(),
  }),
});
export type AttendantResponse = z.infer<typeof AttendantResponse>;

/** Limpezas de estilo que garantem regras de linguagem mesmo se o modelo escorregar. */
export function polishMessage(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}
