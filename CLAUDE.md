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
- `src/lib/attendant/` — comportamento da atendente:
  - `behavior/protected.ts` — regras críticas PROTEGIDAS (só mudam por código) + contrato de saída.
  - `behavior/defaults.ts` — seções EDITÁVEIS (personalidade, comunicação, estratégia, consultório, diferenciais, valores, procedimentos, objeções, exemplos, instruções). A versão em uso fica em `prompt_sections` (com histórico em `prompt_section_versions`).
  - `response.ts` — JSON Schema da resposta: `analise` (interna) + `mensagens` (0–2) + `acoes` (contato, memória, agendamento, objeção, oportunidade, pendência, transferir). Uma única chamada ao modelo por turno.
  - `prompt.ts` — monta prompt estático (cacheável) + contexto dinâmico do contato no fim.
  - `engine.ts` — turno da IA: trava, orçamento, chamada, aplica ações, dedup de eventos.
  - `improve.ts` — gera PROPOSTAS de melhoria a partir das correções do laboratório (nunca aplica sozinho).
- `src/lib/usage/` — orçamento e relatório.
- `src/app/(app)/` — telas autenticadas; `src/middleware.ts` protege tudo com senha (`APP_PASSWORD`).
- Dados do consultório são FICTÍCIOS (seções consultorio/valores/diferenciais) até validação da Mel.

## Comandos
- `npm run dev` · `npm run build` (roda migrações se houver `DATABASE_URL`) · `npm run lint` · `npm run typecheck`
- `npm test` — unitários + integração (precisa de `DATABASE_URL` apontando para um banco **mel_test**).
- `npm run test:e2e` — navegador desktop+celular com IA simulada (rodar `AI_PROVIDER=mock ALLOW_MOCK_AI=1 npm run build` antes; usar banco descartável).
- `npx tsx scripts/simulate.ts <saida.md> [ids]` — bateria de 13 conversas completas com a IA REAL e paciente simulado (custa ~US$ 0,25 por rodada; usar banco descartável, ex. `mel_sim`). Ler o relatório antes de mexer no comportamento.
- Postgres local na nuvem: `/usr/lib/postgresql/16/bin` (initdb/pg_ctl como usuário postgres, socket em /tmp).

## Qualidade
Antes de dar algo por concluído: typecheck, lint, testes, e2e no navegador (desktop e celular), revisão de segurança, commit. Atualizar `DEVLOG.md` ao fim de cada bloco.
