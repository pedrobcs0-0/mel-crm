"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, History, Lock, Sparkles, Trash2, Undo2 } from "lucide-react";
import clsx from "clsx";
import type { BehaviorProposal, ResponseFeedback } from "@/db/schema";
import type { SectionContent } from "@/lib/attendant/behavior/sections";
import { formatDateTime } from "@/lib/format";

type Tab = "secoes" | "correcoes" | "protegidas";

export function BehaviorView(props: {
  sections: SectionContent[];
  feedback: ResponseFeedback[];
  proposals: BehaviorProposal[];
  protectedRules: string;
}) {
  const [tab, setTab] = useState<Tab>("secoes");
  const newCount = props.feedback.filter((f) => f.status === "nova").length;

  return (
    <main className="h-full overflow-y-auto pb-24 md:pb-8">
      <div className="mx-auto max-w-5xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pt-8">
        <h1 className="text-xl font-semibold">Comportamento da atendente</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Edite como a secretária virtual pensa e conversa. As mudanças valem a partir da próxima mensagem. As regras de segurança ficam protegidas.
        </p>
        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-zinc-200" role="tablist">
          {(
            [
              ["secoes", "Instruções"],
              ["correcoes", `Correções${newCount ? ` (${newCount})` : ""}`],
              ["protegidas", "Regras protegidas"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={clsx(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
                tab === k ? "border-teal-700 text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "secoes" && <Sections sections={props.sections} />}
        {tab === "correcoes" && <Corrections feedback={props.feedback} proposals={props.proposals} sections={props.sections} />}
        {tab === "protegidas" && (
          <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <div className="mb-3 flex items-center gap-2 text-sm text-zinc-600">
              <Lock className="h-4 w-4" /> Estas regras valem sempre e não podem ser alteradas pelo painel.
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800">{props.protectedRules.replace(/^## .*\n/, "")}</pre>
          </section>
        )}
      </div>
    </main>
  );
}

function Sections({ sections }: { sections: SectionContent[] }) {
  const router = useRouter();
  const [key, setKey] = useState(sections[0].key);
  const current = sections.find((s) => s.key === key)!;
  const [text, setText] = useState(current.content);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<{ id: string; content: string; note: string | null; createdAt: string }[] | null>(null);
  const dirty = text !== current.content;

  useEffect(() => {
    setText(current.content);
    setMsg(null);
    setHistory(null);
  }, [key, current.content]);

  function select(k: string) {
    if (dirty && !window.confirm("Há alterações não salvas nesta seção. Descartar?")) return;
    setKey(k);
  }

  async function save(content = text, note?: string) {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/behavior/sections/${key}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, note }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    setMsg(res.ok ? { ok: true, text: "Salvo. Vale a partir da próxima resposta." } : { ok: false, text: data.error ?? "Não foi possível salvar." });
    if (res.ok) {
      setHistory(null);
      router.refresh();
    }
  }

  async function loadHistory() {
    const res = await fetch(`/api/behavior/sections/${key}`);
    if (res.ok) setHistory((await res.json()).history);
  }

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-[240px_1fr]">
      <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Seções">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => select(s.key)}
            className={clsx(
              "shrink-0 rounded-xl px-3 py-2 text-left text-sm transition",
              s.key === key ? "bg-teal-50 font-medium text-teal-900 ring-1 ring-teal-200" : "text-zinc-600 hover:bg-white",
            )}
          >
            {s.title}
          </button>
        ))}
      </nav>
      <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{current.title}</h2>
            <p className="text-sm text-zinc-500">{current.help}</p>
          </div>
          <span className="text-xs text-zinc-400">{current.isDefault ? "Texto padrão" : current.updatedAt ? `Editado em ${formatDateTime(current.updatedAt)}` : ""}</span>
        </div>
        <label htmlFor="section-text" className="sr-only">
          Conteúdo da seção
        </label>
        <textarea
          id="section-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={18}
          maxLength={20000}
          className="mt-4 w-full resize-y rounded-xl border border-zinc-300 p-3 text-[15px] leading-relaxed outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => save()} disabled={saving || !dirty || !text.trim()} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40">
            Salvar
          </button>
          {dirty && (
            <button onClick={() => setText(current.content)} className="rounded-xl px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100">
              Descartar alterações
            </button>
          )}
          <button onClick={loadHistory} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            <History className="h-4 w-4" /> Versões anteriores
          </button>
          {msg && <span className={clsx("w-full text-sm", msg.ok ? "text-teal-700" : "text-red-600")}>{msg.text}</span>}
        </div>
        {history && (
          <div className="mt-4 border-t border-zinc-100 pt-4">
            {history.length === 0 ? (
              <p className="text-sm text-zinc-500">Ainda não há versões salvas desta seção.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h, i) => (
                  <li key={h.id} className="flex items-center gap-3 text-sm">
                    <span className="tabular-nums text-zinc-500">{formatDateTime(h.createdAt)}</span>
                    <span className="truncate text-zinc-600">{h.note ?? ""}</span>
                    {i === 0 ? (
                      <span className="ml-auto text-xs text-zinc-400">versão atual</span>
                    ) : (
                      <button onClick={() => setText(h.content)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-teal-700 hover:bg-teal-50">
                        <Undo2 className="h-3.5 w-3.5" /> Carregar no editor
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-zinc-400">Carregar uma versão só coloca o texto no editor. Ela passa a valer quando você salvar.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Corrections({ feedback, proposals, sections }: { feedback: ResponseFeedback[]; proposals: BehaviorProposal[]; sections: SectionContent[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = feedback.filter((f) => f.status === "nova");
  const titleOf = (k: string) => sections.find((s) => s.key === k)?.title ?? k;

  async function act(id: string, action: string) {
    setError(null);
    const res = await fetch(`/api/feedback/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Falhou");
    router.refresh();
  }

  async function propose() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/behavior/proposals", { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Falhou");
    setBusy(false);
    router.refresh();
  }

  async function apply(id: string, index: number) {
    if (!window.confirm("Aplicar esta alteração? Ela passa a valer na próxima resposta da atendente (você pode voltar à versão anterior em Instruções).")) return;
    const res = await fetch(`/api/behavior/proposals/${id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Falhou");
    router.refresh();
  }

  return (
    <div className="mt-5 space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Correções do laboratório</h2>
            <p className="text-sm text-zinc-500">Respostas que você marcou como inadequadas. Elas não mudam nada sozinhas.</p>
          </div>
          <button
            onClick={propose}
            disabled={busy || pending.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> {busy ? "Analisando…" : `Sugerir melhorias (${pending.length})`}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {feedback.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Nenhuma correção ainda. No laboratório, toque em “Avaliar” abaixo de uma resposta da atendente.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {feedback.map((f) => (
              <li key={f.id} className={clsx("rounded-xl border p-4 text-sm", f.status === "nova" ? "border-amber-200 bg-amber-50/40" : "border-zinc-200 opacity-70")}>
                <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{formatDateTime(f.createdAt)}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5">{f.status === "nova" ? "nova" : f.status === "analisada" ? "usada" : "descartada"}</span>
                </div>
                <p className="text-zinc-500">Resposta da atendente:</p>
                <p className="mb-2 rounded-lg bg-white p-2 ring-1 ring-zinc-200">{f.badResponse}</p>
                <p>
                  <b className="font-medium">Motivo:</b> {f.reason}
                </p>
                {f.betterResponse && (
                  <p className="mt-1">
                    <b className="font-medium">Melhor seria:</b> {f.betterResponse}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {f.betterResponse && f.status !== "descartada" && (
                    <button onClick={() => act(f.id, "usar_como_exemplo")} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-white">
                      Adicionar aos exemplos
                    </button>
                  )}
                  {f.status === "nova" ? (
                    <button onClick={() => act(f.id, "descartar")} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:bg-white">
                      <Trash2 className="h-3.5 w-3.5" /> Descartar
                    </button>
                  ) : (
                    <button onClick={() => act(f.id, "reabrir")} className="rounded-lg px-2.5 py-1 text-xs text-zinc-500 hover:bg-white">
                      Reabrir
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {proposals.map((p) => (
        <section key={p.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-700" />
            <h2 className="font-semibold">Proposta de melhoria</h2>
            <span className="text-xs text-zinc-400">{formatDateTime(p.createdAt)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{p.summary}</p>
          <ul className="mt-4 space-y-4">
            {p.changes.map((c, i) => (
              <li key={i} className="rounded-xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{titleOf(c.secao)}</span>
                  {c.aplicada ? (
                    <span className="inline-flex items-center gap-1 text-xs text-teal-700">
                      <CheckCircle2 className="h-4 w-4" /> Aplicada
                    </span>
                  ) : (
                    <button onClick={() => apply(p.id, i)} className="rounded-lg bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800">
                      Aplicar
                    </button>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{c.justificativa}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-teal-700">Ver texto proposto</summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-sans text-sm">{c.novo_conteudo}</pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
