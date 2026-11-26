// Teste ponta a ponta no navegador (desktop e celular) com o provedor de IA simulado.
// Uso: DATABASE_URL=<banco de teste> node tests/e2e/run.mjs  (requer `npm run build` antes)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = "senha-e2e-123";
const SHOTS = process.env.SHOTS_DIR || "test-results";
mkdirSync(SHOTS, { recursive: true });

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, AI_PROVIDER: "mock", ALLOW_MOCK_AI: "1", APP_PASSWORD: PASSWORD, SESSION_SECRET: "e2e-secret-0123456789-0123456789-0123" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
server.stderr.on("data", (d) => process.stderr.write(d));

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/login`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("servidor não subiu");
}

let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed = true;
    console.log(`  ✗ ${name}\n    ${e.message.split("\n")[0]}`);
  }
};

async function flow(label, contextOptions) {
  console.log(`\n${label}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await step("sem login redireciona para /login", async () => {
    await page.goto(`${BASE}/conversas`);
    await page.waitForURL(/\/login/);
  });
  await step("senha errada é recusada", async () => {
    await page.fill("#password", "errada");
    await page.click("button[type=submit]");
    await page.getByRole("alert").waitFor();
  });
  await step("login com senha correta", async () => {
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL(/\/conversas/);
  });
  await page.screenshot({ path: `${SHOTS}/${label}-1-lista.png` });

  await step("cria conversa simulada com origem de anúncio", async () => {
    await page.getByRole("button", { name: "Nova" }).click();
    await page.fill("#nc-name", `Juliana ${label}`);
    await page.selectOption("#nc-origin", "anuncio_instagram");
    await page.getByRole("button", { name: "Começar conversa" }).click();
    await page.waitForURL(/\/conversas\/[0-9a-f-]{36}/);
  });
  await step("paciente escreve e a secretária responde", async () => {
    await page.getByLabel("Mensagem").fill("Oi, boa tarde!");
    await page.getByLabel("Enviar").click();
    await page.getByRole("log").getByText("resposta simulada").first().waitFor();
  });
  await step("pedido de agendamento vira solicitação pendente", async () => {
    await page.getByLabel("Mensagem").fill("Quero agendar uma avaliação");
    await page.getByLabel("Enviar").click();
    await page.getByRole("log").getByText("equipe vai confirmar o horário").first().waitFor();
    const panelOpen = await page.getByLabel("Detalhes do contato").isVisible();
    if (panelOpen) await page.getByLabel("Detalhes do contato").click();
    await page.getByRole("button", { name: "Marcar como agendado" }).last().waitFor();
    await page.getByText("Confirmada", { exact: true }).last().waitFor(); // evidência da origem
  });
  await page.screenshot({ path: `${SHOTS}/${label}-2-conversa.png` });
  if (await page.getByLabel("Fechar").isVisible()) await page.getByLabel("Fechar").click();

  await step("equipe responde e a IA é desativada", async () => {
    await page.getByRole("radio", { name: "Equipe" }).click();
    await page.getByLabel("Mensagem").fill("Oi Juliana, aqui é a Carla da recepção!");
    await page.getByLabel("Enviar").click();
    await page.getByText("Equipe atendendo · IA desativada").waitFor();
  });
  await step("mensagem do paciente com IA desativada não recebe resposta da IA", async () => {
    await page.getByRole("radio", { name: "Paciente (teste)" }).click();
    const before = await page.getByRole("log").getByText("Secretária virtual", { exact: true }).count();
    await page.getByLabel("Mensagem").fill("Obrigada!");
    await page.getByLabel("Enviar").click();
    await page.getByText("Paciente aguardando resposta da equipe").first().waitFor();
    assert.equal(await page.getByRole("log").getByText("Secretária virtual", { exact: true }).count(), before);
  });
  await step("reativar IA", async () => {
    await page.getByRole("button", { name: "Reativar IA" }).click();
    await page.getByRole("log").getByText("IA reativada pela equipe.").waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/${label}-3-equipe.png` });

  await step("tela de consumo mostra gastos e salva limites", async () => {
    await page.goto(`${BASE}/consumo`);
    await page.getByText("Chamadas recentes").waitFor();
    await page.fill("#daily", "50");
    await page.getByRole("button", { name: "Salvar limites" }).click();
    await page.getByText(/limite máximo permitido/).waitFor();
    await page.fill("#daily", "0.5");
    await page.getByRole("button", { name: "Salvar limites" }).click();
    await page.getByText("Salvo.").waitFor();
  });
  await page.screenshot({ path: `${SHOTS}/${label}-4-consumo.png`, fullPage: true });

  await step("pausar IA bloqueia respostas", async () => {
    await page.getByRole("button", { name: "Pausar IA agora" }).click();
    await page.getByText("A IA está pausada em todas as conversas.").waitFor();
    await page.goto(`${BASE}/conversas`);
    await page.getByRole("link", { name: new RegExp(`Juliana ${label}`) }).first().click();
    await page.waitForURL(/\/conversas\/[0-9a-f-]{36}/);
    await page.getByLabel("Mensagem").fill("Ainda está aí?");
    await page.getByLabel("Enviar").click();
    await page.getByRole("log").getByText(/IA não respondeu: A IA está pausada/).waitFor();
    await page.goto(`${BASE}/consumo`);
    await page.getByRole("button", { name: "Retomar IA" }).click();
    await page.getByRole("button", { name: "Pausar IA agora" }).waitFor();
  });

  await step("sem rolagem horizontal na página", async () => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(w <= 0, `excesso horizontal de ${w}px`);
  });
  await step("sem erros de JavaScript", async () => assert.deepEqual(errors, []));
  await browser.close();
}

try {
  await waitUp();
  await step("API sem sessão responde 401", async () => {
    const r = await fetch(`${BASE}/api/settings`, { method: "PUT", body: "{}" });
    assert.equal(r.status, 401);
  });
  await step("cabeçalhos de segurança presentes", async () => {
    const r = await fetch(`${BASE}/login`);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
  });
  await flow("desktop", { viewport: { width: 1440, height: 900 } });
  await flow("celular", { ...devices["iPhone 13"] });
} finally {
  process.kill(-server.pid, "SIGTERM");
}
console.log(failed ? "\nFALHOU" : "\nTODOS OS TESTES PASSARAM");
process.exit(failed ? 1 : 0);
