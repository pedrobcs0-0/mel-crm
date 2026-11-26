"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, PlayCircle } from "lucide-react";
import clsx from "clsx";
import type { UsageReport } from "@/lib/usage/report";
import { formatDateTime, usd } from "@/lib/format";

export function UsageView({ report }: { report: UsageReport }) {
  const router = useRouter();
  const { settings, spend } = report;
  const [daily, setDaily] = useState(String(settings.dailyLimitUsd));
  const [monthly, setMonthly] = useState(String(settings.monthlyLimitUsd));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const monthlyLimit = Math.min(settings.monthlyLimitUsd, report.hardCap);

  async function save(next: { aiPaused?: boolean } = {}) {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dailyLimitUsd: Number(daily.replace(",", ".")),
        monthlyLimitUsd: Number(monthly.replace(",", ".")),
        aiPaused: next.aiPaused ?? settings.aiPaused,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Salvo." } : { ok: false, text: data.error ?? "Não foi possível salvar." });
    setSaving(false);
    router.refresh();
  }

  const maxDay = Math.max(0.0001, ...report.daily.map((d) => d.cost));

  return (
    <main className="h-full overflow-y-auto pb-24 md:pb-8">
      <div className="mx-auto max-w-4xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-8 md:pt-8">
        <h1 className="text-xl font-semibold">Consumo de IA</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Modelo: <b className="font-medium text-zinc-700">{report.model}</b> · valores em dólar, calculados pelo número de tokens de cada resposta.
        </p>

        {!report.keyConfigured && (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            A chave da OpenAI ainda não está configurada neste ambiente. A secretária não vai responder até ela ser cadastrada.
          </div>
        )}
        {settings.aiPaused && (
          <div className="mt-4 flex gap-3 rounded-xl border border-zinc-300 bg-zinc-100 p-4 text-sm text-zinc-800">
            <PauseCircle className="h-5 w-5 shrink-0" />
            A IA está pausada em todas as conversas.
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Meter label="Hoje" spent={spend.today} limit={settings.dailyLimitUsd} />
          <Meter label="Este mês" spent={spend.month} limit={monthlyLimit} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <Stat label="Respostas no mês" value={report.month.calls} />
          <Stat label="Bloqueadas por limite" value={report.month.blocked} />
          <Stat label="Falhas" value={report.month.errors} />
        </div>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="font-semibold">Limites</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ao atingir um limite, a IA para de responder e a conversa fica marcada para a equipe. O teto máximo permitido é {usd(report.hardCap)} por mês.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <MoneyInput id="daily" label="Limite diário (US$)" value={daily} onChange={setDaily} />
            <MoneyInput id="monthly" label="Limite mensal (US$)" value={monthly} onChange={setMonthly} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={() => save()} disabled={saving} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
              Salvar limites
            </button>
            <button
              onClick={() => save({ aiPaused: !settings.aiPaused })}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {settings.aiPaused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
              {settings.aiPaused ? "Retomar IA" : "Pausar IA agora"}
            </button>
            {msg && (
              <span className={clsx("inline-flex items-center gap-1 text-sm", msg.ok ? "text-teal-700" : "text-red-600")}>
                {msg.ok && <CheckCircle2 className="h-4 w-4" />} {msg.text}
              </span>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="font-semibold">Últimos 14 dias</h2>
          {report.daily.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Sem uso ainda.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {report.daily.map((d) => (
                <li key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 tabular-nums text-zinc-500">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                  <div className="h-2.5 flex-1 rounded-full bg-zinc-100">
                    <div className="h-2.5 rounded-full bg-teal-600" style={{ width: `${Math.max(2, (d.cost / maxDay) * 100)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums">{usd(d.cost, 4)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="font-semibold">Chamadas recentes</h2>
          {report.recent.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Nenhuma chamada ainda.</p>
          ) : (
            <div className="-mx-5 mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Quando</th>
                    <th className="px-2 py-2 font-medium">Situação</th>
                    <th className="px-2 py-2 text-right font-medium">Entrada</th>
                    <th className="px-2 py-2 text-right font-medium">Saída</th>
                    <th className="px-5 py-2 text-right font-medium">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent.map((u) => (
                    <tr key={u.id} className="border-t border-zinc-100">
                      <td className="px-5 py-2 tabular-nums text-zinc-600">{formatDateTime(u.createdAt)}</td>
                      <td className="px-2 py-2">
                        <span
                          title={u.detail ?? undefined}
                          className={clsx(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            u.status === "ok" && "bg-teal-50 text-teal-700",
                            u.status === "bloqueado" && "bg-amber-50 text-amber-800",
                            u.status === "erro" && "bg-red-50 text-red-700",
                          )}
                        >
                          {u.status === "ok" ? "ok" : u.status === "bloqueado" ? "bloqueada" : "falha"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{u.inputTokens.toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{u.outputTokens.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{usd(u.costUsd, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Meter({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 100;
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-zinc-500">{label}</span>
        <span className="text-xs text-zinc-400">limite {usd(limit)}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{usd(spent, 4)}</div>
      <div className="mt-3 h-2 rounded-full bg-zinc-100">
        <div className={clsx("h-2 rounded-full transition-all", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-teal-600")} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <div className="mt-1 text-xs text-zinc-400">{pct.toFixed(0)}% usado</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function MoneyInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-base tabular-nums outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
      />
    </div>
  );
}
