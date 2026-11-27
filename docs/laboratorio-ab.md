# Laboratório independente — candidata ChatGPT B

Branch experimental. A implementação original e o motor principal permanecem intactos.
- Rota autenticada: /comparacao. Sem gravação de pacientes, mensagens, solicitações ou eventos; somente contabilização das chamadas em ai_usage.
- Ative MEL_AB_LAB_ENABLED=1 exclusivamente em ambiente isolado de teste/preview. A API bloqueia VERCEL_ENV=production. O ambiente deve ter o esquema já migrado e a configuração do modelo GPT-5 mini. Não use dados reais.
- O build desta branch não executa migração automática. Nunca compartilhe segredos com o chat nem execute scripts/simulate.ts contra o banco compartilhado.
- As duas variantes usam a mesma configuração factual atual e o mesmo modelo/medium/4000 tokens, o mesmo contrato de resposta e pós-processamento. A usa todas as seções ativas; B usa apenas consultório, valores e diferenciais e sua estratégia própria. Fatos adicionais em outras seções devem ser reconciliados antes de uma avaliação formal.
- Históricos e ações simuladas são independentes no navegador. Alterações nas instruções entre turnos invalidam o snapshot. Exporte o JSON antes de sair: não há armazenamento persistente dos testes.
- Atribuição 1/2 aleatória, sem autoria visível até a preferência. Para conversas adaptativas, envie mensagens separadas. O laboratório não testa o motor de escrita, webhooks ou garantias clínicas; não demonstra conversão real.
- A chamada usa o limite global existente; não executar sessões paralelas. Custos incertos em falhas podem não ser contabilizados com precisão pelo provedor.
- Antes de produção: typecheck/build/testes com dependências instaladas, revisão de segurança, teste real controlado e dados validados. Esta branch não está autorizada para merge ou deploy de produção.
