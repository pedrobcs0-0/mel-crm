import type { AIProvider, ChatRequest, ChatResponse } from "./types";

/**
 * Provedor simulado, usado SOMENTE em testes automatizados (AI_PROVIDER=mock).
 * Nunca é selecionado em produção.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock";
  isConfigured() {
    return true;
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const last = req.messages[req.messages.length - 1];
    const usage = { inputTokens: 1200, cachedInputTokens: 0, outputTokens: 150 };
    if (last.role === "tool") {
      return { text: "Prontinho! Registrei seu pedido e a equipe vai confirmar o horário com você em breve. 😊", toolCalls: [], usage, model: this.model };
    }
    const text = last.role === "user" ? last.content.toLowerCase() : "";
    if (text.includes("agendar")) {
      return {
        text: "",
        toolCalls: [
          {
            id: "call_mock_1",
            name: "solicitar_agendamento",
            arguments: JSON.stringify({ nome_paciente: "Paciente Teste", procedimento: "avaliação", periodo_preferido: "manhã", urgente: false }),
          },
        ],
        usage,
        model: this.model,
      };
    }
    return { text: "Olá! Aqui é do consultório da Dra. Mel. Como posso te ajudar? (resposta simulada)", toolCalls: [], usage, model: this.model };
  }
}
