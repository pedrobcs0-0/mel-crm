import type { AIProvider, ChatRequest, ChatResponse } from "./types";

/**
 * Provedor simulado, usado SOMENTE em testes automatizados (AI_PROVIDER=mock).
 * Nunca é selecionado em produção (exceto com ALLOW_MOCK_AI=1 nos testes de navegador).
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock";
  isConfigured() {
    return true;
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const usage = { inputTokens: 1200, cachedInputTokens: 0, outputTokens: 150 };
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const text = lastUser && "content" in lastUser ? lastUser.content.toLowerCase() : "";
    const wantsBooking = text.includes("agendar");
    const body = {
      analise: {
        intencao: wantsBooking ? "agendar" : "conversar",
        momento: wantsBooking ? "agendando" : "abertura",
        perfil: wantsBooking ? "decidido" : "indefinido",
        urgencia: text.includes("dor forte") ? "urgente" : "nenhuma",
        ja_sabemos: "teste",
        relevante_descobrir: "nada",
        objecao_ou_duvida: null,
        paciente_pediu_valor: false,
        proxima_intervencao: "responder",
        deve_perguntar: false,
      },
      mensagens: wantsBooking
        ? ["Certo, registrei seu pedido e a equipe vai confirmar o horário com você em breve."]
        : text === "ok"
          ? []
          : ["Oi, tudo bem? Sou a assistente virtual da Dra. Mel. (resposta simulada)"],
      acoes: {
        contato: null,
        memoria: wantsBooking ? "Quer agendar avaliação pela manhã." : null,
        solicitar_agendamento: wantsBooking
          ? { nome_paciente: "Paciente Teste", procedimento: "avaliação", periodo_preferido: "manhã", observacoes: null, urgente: false }
          : null,
        objecao: text.includes("pesquisar") ? { tipo: "pesquisando_outros", descricao: "Vai pesquisar outros lugares" } : null,
        oportunidade: null,
        pendencia_equipe: null,
        transferir: text.includes("falar com alguém") ? { motivo: "Pediu atendimento humano" } : null,
      },
    };
    return { text: JSON.stringify(body), toolCalls: [], usage, model: this.model };
  }
}
