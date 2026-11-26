# DEVLOG — Mel CRM

## 2026-11-26 · Bloco 1 — Primeira versão da atendente (laboratório)

**Entregue**
- App Next.js + PostgreSQL com login por senha única (cookie assinado, 30 dias, limite de tentativas).
- Laboratório de atendimento: criar paciente simulado (com origem simulada: mensagem direta, anúncio Instagram/Facebook, link do site) e conversar como paciente; a secretária virtual responde em estilo WhatsApp.
- Atendente com GPT-5 mini (provedor trocável), prompt em português com regras do consultório e base de conhecimento **fictícia**.
- Ferramentas da IA: solicitação de agendamento (nunca confirma horário), registro de nome/origem declarada, transferência para humano.
- Supervisão: botão Assumir / Reativar IA; enviar como "Equipe" assume a conversa; aviso "Precisa da equipe" quando a IA é bloqueada, falha ou transfere.
- Painel do contato: origem com nível de evidência, solicitações de agendamento (marcar agendado/descartar), custo de IA da conversa.
- Consumo: gasto do dia/mês (fuso Cuiabá), limites diário e mensal editáveis, teto absoluto US$ 10, pausa geral da IA, histórico de 14 dias e chamadas recentes. Bloqueio antes da chamada pelo custo de pior caso.
- Segurança: rotas e APIs protegidas por middleware, checagem de origem (CSRF), validação zod, cabeçalhos de segurança, `noindex`, segredos só em variáveis de ambiente.

**Decisões técnicas**
- Chat Completions com `reasoning_effort: low` e `max_completion_tokens: 1500` (inclui raciocínio) — equilíbrio custo/qualidade; revisar no laboratório.
- Trava `ai_busy_until` por conversa em vez de fila: evita respostas duplicadas sem infraestrutura extra.
- Hospedagem de testes: Vercel + Neon gratuitos (escolha do Pedro). Produção futura em servidor próprio.

**Testes**: 18 unitários/integração (custos, limites, regras da IA com banco real) + 30 verificações e2e no navegador (desktop 1440px e iPhone 13). Todos passando com IA simulada. IA real ainda não testada: chave OpenAI não estava disponível na sessão.

**Pendências**: testar IA real e ajustar tom; base de conhecimento real (dados do consultório); link na Vercel.

**Próxima entrega sugerida**: base de conhecimento editável + memória do paciente + ajustes de naturalidade a partir dos testes do Pedro.
