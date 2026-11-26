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

## 2026-11-26 · Bloco 2 — Inteligência conversacional e comercial

**Motivação**: nos testes do Pedro a atendente seguia um checklist (nome, urgência, preço, agendamento, origem) independentemente do contexto.

**Entregue**
- Nova arquitetura de decisão: uma única chamada ao modelo devolve JSON estrito com `analise` interna (intenção, momento, perfil, urgência, o que já sabemos, o que vale descobrir, objeção, se pediu valor, próxima intervenção, se deve perguntar), `mensagens` (0 a 2) e `acoes` de CRM. Registrar algo no CRM não obriga a mencionar ao paciente. A IA pode optar por não responder (ex.: "ok" depois da despedida).
- Instruções em camadas: regras críticas protegidas no código + 10 seções editáveis no painel (personalidade, comunicação, estratégia comercial, consultório, diferenciais, valores autorizados, procedimentos, objeções, exemplos, instruções). Histórico de versões por seção.
- Memória do paciente (resumo do que já sabemos), objeções e oportunidades de acompanhamento no CRM, sem duplicar.
- Nova ação `pendencia_equipe`: avisa a equipe sem desligar a IA (antes, qualquer dúvida transferia a conversa).
- Laboratório: ver a análise interna de cada resposta e "avaliar" (motivo + resposta melhor). Em Ajustes > Correções: adicionar aos exemplos, descartar, ou "Sugerir melhorias" (a IA propõe mudanças gerais por seção; só valem quando uma pessoa clica em Aplicar).
- Pós-processamento: remove emojis e travessões.
- Abatimento da avaliação em 30 dias removido (não autorizado). Diferenciais marcados como pendentes de validação pela Mel.

**Decisões técnicas**
- `reasoning_effort` passou de low para **medium**: bateria comparativa mostrou ganho claro (menos anamnese em casos de dor, menos repetição, menos alucinação). Custo ~US$ 0,003 por resposta (~US$ 2,50/mês para 100 conversas de 8 mensagens).
- Prompt estático primeiro e contexto do contato no fim, com `prompt_cache_key`, para aproveitar cache da OpenAI.
- `scripts/simulate.ts`: 13 conversas completas com paciente simulado por IA (objetiva, insegura, preço, pesquisando, paciente antigo, dor, urgência grave, reclamação, convênio, implante, encerra cedo, manipulação, anúncio) + verificações automáticas (emoji, travessão, preço não pedido, duas perguntas, confirmação de horário, frases genéricas, repetição de nome).

**Limitações conhecidas**: o modelo às vezes ainda oferece agendamento ao fim de respostas informativas e usa o nome um pouco mais que o ideal; dúvidas práticas viram pendência para a equipe (correto, mas exige resposta humana). Valores e dados do consultório seguem fictícios.
