# Mel CRM — instruções permanentes para agentes

Projeto: secretária virtual com IA (WhatsApp) + CRM/painel para o consultório odontológico da Dra. Mel (Cuiabá-MT). Uso exclusivo do consultório (sem multi-tenant). Idioma do produto, código de domínio e comunicação: **português**.

## Papéis
- Pedro é o dono do produto (não técnico). O agente faz toda a execução técnica de forma autônoma e documenta decisões importantes no `DEVLOG.md`.
- Perguntar ao Pedro só sobre: produto/UX, funcionamento do consultório, credenciais/contas, custos, ações irreversíveis, integrações reais, segurança/privacidade/regulação.

## Proibido sem autorização explícita do Pedro
Contratar serviços ou gastar dinheiro · expor ambientes publicamente sem senha · alterar contas reais · conectar o número da Mel · usar dados reais de pacientes · exclusão irreversível de dados · deploy em produção. Não reduzir requisitos de segurança para acelerar.

## Regras de produto (não negociáveis)
- A IA **nunca confirma horário**: cria `appointment_requests` (status `pendente`) para validação humana.
- Conversa assumida por humano ⇒ `ai_enabled=false` até reativação explícita.
- Envio de resultado incerto (ex.: WhatsApp) não é repetido automaticamente sem reconciliação.
- Origem do contato sempre com nível de evidência: `confirmada` (rastreio técnico) > `declarada` (paciente disse) > `inferida` > `desconhecida`. Evidência mais fraca nunca sobrescreve mais forte.
- Controles de consumo: limites diário/mensal na tabela `settings`, teto absoluto `AI_HARD_MONTHLY_CAP_USD` (padrão US$ 10). Toda chamada de IA é registrada em `ai_usage` e checada antes pelo custo de pior caso.
- Simples Dental continua o sistema clínico principal (não tem API). Datafy/EasyCoexistence são candidatos condicionados a validação.
- Sem n8n no núcleo, sem multiagentes, sem banco vetorial.

## Stack
Next.js 15 (App Router) + TypeScript + Tailwind 4 · PostgreSQL via Drizzle ORM (`postgres` driver, `prepare:false` para Neon) · OpenAI GPT-5 mini via `src/lib/ai` (interface `AIProvider`, trocável) · zod · jose (sessão) · lucide-react.

## Estrutura
- `src/db/schema.ts` — tabelas; migrações em `drizzle/` (`npm run db:generate` depois de mudar o schema).
- `src/lib/ai/` — provedores (`openai.ts`, `mock.ts` só para testes), `pricing.ts` (preços por modelo).
- `src/lib/attendant/` — prompt, ferramentas (solicitar_agendamento, registrar_contato, transferir_para_humano) e `engine.ts` (turno da IA, trava, orçamento).
- `src/lib/usage/` — orçamento e relatório.
- `src/app/(app)/` — telas autenticadas; `src/middleware.ts` protege tudo com senha (`APP_PASSWORD`).
- `src/lib/clinic/knowledge.ts` — base FICTÍCIA (vai virar base editável).

## Comandos
- `npm run dev` · `npm run build` (roda migrações se houver `DATABASE_URL`) · `npm run lint` · `npm run typecheck`
- `npm test` — unitários + integração (precisa de `DATABASE_URL` apontando para um banco **mel_test**).
- `npm run test:e2e` — navegador desktop+celular com IA simulada (rodar `AI_PROVIDER=mock ALLOW_MOCK_AI=1 npm run build` antes; usar banco descartável).
- Postgres local na nuvem: `/usr/lib/postgresql/16/bin` (initdb/pg_ctl como usuário postgres, socket em /tmp).

## Qualidade
Antes de dar algo por concluído: typecheck, lint, testes, e2e no navegador (desktop e celular), revisão de segurança, commit. Atualizar `DEVLOG.md` ao fim de cada bloco.
