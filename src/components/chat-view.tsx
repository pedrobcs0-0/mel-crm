"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Brain, CalendarClock, Flag, Info, SendHorizontal, UserRound, X } from "lucide-react";
import clsx from "clsx";
import type { ConversationDetail } from "@/lib/data";
import { EVIDENCE_LABEL, formatDateTime, formatTime, initials, ORIGIN_LABEL, usd } from "@/lib/format";

type Mode = "paciente" | "humano";
type Msg = ConversationDetail["messages"][number];

export function ChatView({ initial }: { initial: ConversationDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [pending, setPending] = useState<Msg | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("paciente");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [rating, setRating] = useState<Msg | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const { conversation, contact } = detail;
  const title = contact.name ?? contact.phone ?? "Contato";

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [detail.messages.length, pending, busy]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setPending({
      id: "pending",
      conversationId: conversation.id,
      sender: mode,
      content,
      meta: null,
      createdAt: new Date(),
    });
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, as: mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar");
      setDetail(data.detail);
      router.refresh();
    } catch (e) {
      setText(content);
      setError(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setPending(null);
      setBusy(false);
      input.current?.focus();
    }
  }

  async function toggleAI(enabled: boolean) {
    setBusy(true);
    const res = await fetch(`/api/conversations/${conversation.id}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      setDetail((await res.json()).detail);
      if (enabled) setMode("paciente");
      router.refresh();
    }
    setBusy(false);
  }

  async function setRequestStatus(id: string, status: "confirmada" | "recusada" | "pendente") {
    const res = await fetch(`/api/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setDetail((d) => ({ ...d, requests: d.requests.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }

  const messages = pending ? [...detail.messages, pending] : detail.messages;
  const aiThinking = busy && pending?.sender === "paciente" && conversation.aiEnabled;

  return (
    <section className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho */}
        <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:px-5">
          <Link href="/conversas" className="-ml-1 rounded-full p-2 text-zinc-600 hover:bg-zinc-100 md:hidden" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
            {contact.name ? initials(contact.name) : <UserRound className="h-5 w-5 text-zinc-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold leading-tight">{title}</h2>
            <p className="truncate text-xs text-zinc-500">
              {conversation.aiEnabled ? (
                <span className="inline-flex items-center gap-1 text-teal-700">
                  <Bot className="h-3.5 w-3.5" /> Secretária virtual atendendo
                </span>
              ) : (
                <span className="text-sky-700">Equipe atendendo · IA desativada</span>
              )}
            </p>
          </div>
          {conversation.aiEnabled ? (
            <button
              onClick={() => toggleAI(false)}
              disabled={busy}
              className="shrink-0 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Assumir
            </button>
          ) : (
            <button
              onClick={() => toggleAI(true)}
              disabled={busy}
              className="shrink-0 rounded-full bg-teal-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
            >
              Reativar IA
            </button>
          )}
          <button onClick={() => setShowInfo(true)} className="shrink-0 rounded-full p-2 text-zinc-500 hover:bg-zinc-100 xl:hidden" aria-label="Detalhes do contato">
            <Info className="h-5 w-5" />
          </button>
        </header>

        {conversation.needsHuman && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            <b>Precisa da equipe:</b> {conversation.needsHumanReason ?? "verifique a conversa"}
          </div>
        )}

        {/* Mensagens */}
        <div ref={scroller} role="log" aria-label="Mensagens" className="chat-bg flex-1 overflow-y-auto px-3 py-4 md:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            {messages.length === 0 && (
              <div className="mx-auto my-8 max-w-xs rounded-xl bg-white/80 px-4 py-3 text-center text-sm text-zinc-500 shadow-sm">
                Escreva a primeira mensagem como se fosse o paciente, por exemplo: <i>“Oi, quanto custa um clareamento?”</i>
              </div>
            )}
            {messages.map((m) => (
              <Bubble
                key={m.id}
                m={m}
                pending={m.id === "pending"}
                rated={detail.ratedMessageIds.includes(m.id)}
                onRate={() => setRating(m)}
              />
            ))}
            {aiThinking && (
              <div className="flex justify-end">
                <div className="typing flex gap-1 rounded-2xl rounded-br-md bg-teal-50 px-4 py-3 ring-1 ring-teal-100" aria-label="Secretária digitando">
                  <span className="h-2 w-2 rounded-full bg-teal-600" />
                  <span className="h-2 w-2 rounded-full bg-teal-600" />
                  <span className="h-2 w-2 rounded-full bg-teal-600" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-zinc-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:px-5">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-zinc-500">Escrever como:</span>
              <div className="inline-flex rounded-full bg-zinc-100 p-0.5 text-xs font-medium" role="radiogroup">
                {(["paciente", "humano"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={clsx("rounded-full px-3 py-1 transition", mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                  >
                    {m === "paciente" ? "Paciente (teste)" : "Equipe"}
                  </button>
                ))}
              </div>
            </div>
            {mode === "humano" && conversation.aiEnabled && (
              <p className="mb-2 text-xs text-sky-700">Ao enviar como equipe, você assume a conversa e a IA fica desativada até ser reativada.</p>
            )}
            {mode === "paciente" && !conversation.aiEnabled && (
              <p className="mb-2 text-xs text-zinc-500">A IA está desativada nesta conversa: a mensagem fica aguardando a equipe.</p>
            )}
            {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <textarea
                ref={input}
                rows={1}
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={mode === "paciente" ? "Mensagem do paciente…" : "Resposta da equipe…"}
                aria-label="Mensagem"
                className="max-h-36 min-h-[44px] flex-1 resize-none rounded-2xl border border-zinc-300 bg-white px-4 py-2.5 text-base leading-snug outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
              <button
                type="submit"
                disabled={busy || !text.trim()}
                aria-label="Enviar"
                className={clsx(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-40",
                  mode === "paciente" ? "bg-zinc-800 hover:bg-zinc-900" : "bg-sky-700 hover:bg-sky-800",
                )}
              >
                <SendHorizontal className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Painel de detalhes: fixo no desktop largo, gaveta no resto */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white xl:block">
        <Details detail={detail} onStatus={setRequestStatus} />
      </aside>
      {rating && (
        <FeedbackDialog
          message={rating}
          onClose={() => setRating(null)}
          onSaved={() => {
            setDetail((d) => ({ ...d, ratedMessageIds: [...d.ratedMessageIds, rating.id] }));
            setRating(null);
          }}
        />
      )}
      {showInfo && (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-zinc-900/30" onClick={() => setShowInfo(false)} />
          <div className="absolute inset-y-0 right-0 w-[min(90vw,360px)] overflow-y-auto bg-white shadow-xl">
            <div className="flex justify-end p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <button onClick={() => setShowInfo(false)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Details detail={detail} onStatus={setRequestStatus} />
          </div>
        </div>
      )}
    </section>
  );
}

const MOMENTO: Record<string, string> = {
  abertura: "abertura",
  entendendo_necessidade: "entendendo a necessidade",
  duvida_informacao: "dúvida / informação",
  objecao: "objeção",
  decidindo: "decidindo",
  agendando: "agendando",
  encerramento: "encerrando",
  pos_agendamento: "pós-agendamento",
  fora_do_escopo: "fora do escopo",
};

function Analysis({ meta }: { meta: NonNullable<Msg["meta"]> }) {
  const a = (meta.analise ?? {}) as Record<string, string | boolean | null>;
  return (
    <div className="mt-2 space-y-1 rounded-lg bg-white/70 p-2 text-[12px] leading-snug text-zinc-600 ring-1 ring-teal-100">
      <p>
        <b className="font-medium text-zinc-700">Intenção:</b> {String(a.intencao ?? "")}
      </p>
      <p>
        <b className="font-medium text-zinc-700">Momento:</b> {MOMENTO[String(a.momento)] ?? String(a.momento)} · <b className="font-medium text-zinc-700">Perfil:</b>{" "}
        {String(a.perfil ?? "").replaceAll("_", " ")} · <b className="font-medium text-zinc-700">Urgência:</b> {String(a.urgencia)}
      </p>
      {a.objecao_ou_duvida && (
        <p>
          <b className="font-medium text-zinc-700">Dúvida/objeção:</b> {String(a.objecao_ou_duvida)}
        </p>
      )}
      <p>
        <b className="font-medium text-zinc-700">Decisão:</b> {String(a.proxima_intervencao ?? "")}
      </p>
      {meta.acoes && meta.acoes.length > 0 && (
        <p>
          <b className="font-medium text-zinc-700">Registrado no CRM:</b> {meta.acoes.join(" · ")}
        </p>
      )}
    </div>
  );
}

function Bubble({ m, pending, rated, onRate }: { m: Msg; pending: boolean; rated: boolean; onRate: () => void }) {
  const [open, setOpen] = useState(false);
  if (m.sender === "sistema") {
    return (
      <div className="my-1.5 flex flex-col items-center">
        <span className="max-w-[90%] rounded-lg bg-white/90 px-3 py-1 text-center text-xs text-zinc-500 shadow-sm">{m.content}</span>
        {m.meta?.analise && (
          <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[11px] text-teal-700">
            {open ? "ocultar análise" : "ver análise"}
          </button>
        )}
        {open && m.meta && (
          <div className="max-w-[85%]">
            <Analysis meta={m.meta} />
          </div>
        )}
      </div>
    );
  }
  const fromClinic = m.sender !== "paciente";
  return (
    <div className={clsx("flex flex-col", fromClinic ? "items-end" : "items-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm md:max-w-[70%]",
          m.sender === "paciente" && "rounded-bl-md bg-white",
          m.sender === "ia" && "rounded-br-md bg-teal-50 ring-1 ring-teal-100",
          m.sender === "humano" && "rounded-br-md bg-sky-50 ring-1 ring-sky-100",
          pending && "opacity-60",
        )}
      >
        {fromClinic && (
          <div className={clsx("mb-0.5 text-[11px] font-medium", m.sender === "ia" ? "text-teal-700" : "text-sky-700")}>
            {m.sender === "ia" ? "Secretária virtual" : "Equipe"}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.content}</p>
        <div className="mt-0.5 text-right text-[10px] text-zinc-400">{pending ? "enviando…" : formatTime(m.createdAt)}</div>
        {open && m.meta && <Analysis meta={m.meta} />}
      </div>
      {m.sender === "ia" && !pending && (
        <div className="mt-0.5 flex gap-3 pr-1 text-[11px]">
          {m.meta?.analise && (
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-zinc-400 hover:text-teal-700">
              <Brain className="h-3 w-3" /> {open ? "ocultar análise" : "análise"}
            </button>
          )}
          {rated ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Flag className="h-3 w-3" /> avaliada
            </span>
          ) : (
            <button onClick={onRate} className="inline-flex items-center gap-1 text-zinc-400 hover:text-amber-700">
              <Flag className="h-3 w-3" /> avaliar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackDialog({ message, onClose, onSaved }: { message: Msg; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [better, setBetter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId: message.id, reason, betterResponse: better || undefined }),
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setError((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar.");
  }

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(94vw,520px)] rounded-2xl p-0 shadow-xl backdrop:bg-zinc-900/30">
      <form onSubmit={save} className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Avaliar resposta</h2>
            <p className="text-sm text-zinc-500">Vira uma correção em Ajustes. Nada muda automaticamente.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 rounded-xl bg-teal-50 p-3 text-sm ring-1 ring-teal-100">{message.content}</p>
        <label htmlFor="fb-reason" className="mb-1 block text-sm font-medium text-zinc-700">
          O que não ficou bom?
        </label>
        <textarea
          id="fb-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={2000}
          required
          placeholder="Ex.: falou de preço antes de entender o que a paciente queria."
          className="mb-4 w-full rounded-xl border border-zinc-300 p-3 text-base outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        />
        <label htmlFor="fb-better" className="mb-1 block text-sm font-medium text-zinc-700">
          Como seria uma resposta melhor? <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <textarea
          id="fb-better"
          value={better}
          onChange={(e) => setBetter(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-xl border border-zinc-300 p-3 text-base outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={saving || reason.trim().length < 3} className="mt-5 w-full rounded-xl bg-teal-700 py-2.5 font-medium text-white hover:bg-teal-800 disabled:opacity-40">
          {saving ? "Salvando…" : "Salvar correção"}
        </button>
      </form>
    </dialog>
  );
}

function Details({
  detail,
  onStatus,
}: {
  detail: ConversationDetail;
  onStatus: (id: string, s: "confirmada" | "recusada" | "pendente") => void;
}) {
  const { contact, requests } = detail;
  const ev = EVIDENCE_LABEL[contact.originEvidence];
  return (
    <div className="space-y-6 p-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Contato</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Nome" value={contact.name ?? "Não informado"} />
          <Row label="Telefone" value={contact.phone ?? "—"} />
          <div>
            <dt className="text-zinc-500">Origem</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium">{contact.origin ? ORIGIN_LABEL[contact.origin] ?? contact.origin : "Não identificada"}</span>
              <span title={ev.hint} className={clsx("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", ev.className)}>
                {ev.label}
              </span>
            </dd>
            {contact.originDetail && <dd className="mt-1 text-xs text-zinc-500">{contact.originDetail}</dd>}
            <dd className="mt-1 text-xs text-zinc-400">{ev.hint}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Solicitações de agendamento</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma ainda. Quando o paciente pedir horário, a secretária registra aqui para a equipe confirmar.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className={clsx("rounded-xl border p-3 text-sm", r.urgent ? "border-red-200 bg-red-50/50" : "border-zinc-200")}>
                <div className="mb-1 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-zinc-400" />
                  <span className="font-medium">{r.procedure ?? "Consulta"}</span>
                  {r.urgent && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Urgente</span>}
                </div>
                {r.patientName && <p className="text-zinc-600">Paciente: {r.patientName}</p>}
                <p className="text-zinc-600">Preferência: {r.preferredPeriod ?? "—"}</p>
                {r.notes && <p className="mt-1 text-zinc-500">{r.notes}</p>}
                <p className="mt-1 text-xs text-zinc-400">Pedido em {formatDateTime(r.createdAt)}</p>
                <div className="mt-2 flex items-center gap-2">
                  {r.status === "pendente" ? (
                    <>
                      <button onClick={() => onStatus(r.id, "confirmada")} className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800">
                        Marcar como agendado
                      </button>
                      <button onClick={() => onStatus(r.id, "recusada")} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                        Descartar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", r.status === "confirmada" ? "bg-teal-100 text-teal-800" : "bg-zinc-100 text-zinc-600")}>
                        {r.status === "confirmada" ? "Agendado" : "Descartado"}
                      </span>
                      <button onClick={() => onStatus(r.id, "pendente")} className="text-xs text-zinc-400 underline-offset-2 hover:underline">
                        desfazer
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">O que já sabemos</h3>
        <p className="text-sm text-zinc-700">{contact.summary ?? "Nada registrado ainda."}</p>
      </section>

      {detail.events.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Objeções e oportunidades</h3>
          <ul className="space-y-2 text-sm">
            {detail.events.map((e) => (
              <li key={e.id} className="rounded-lg bg-zinc-50 p-2">
                <span className={clsx("mr-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", e.type === "objecao" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800")}>
                  {e.type === "objecao" ? `Objeção${e.category ? `: ${e.category.replaceAll("_", " ")}` : ""}` : "Oportunidade"}
                </span>
                {e.description}
                {e.when && <span className="text-zinc-500"> · {e.when}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Custo de IA nesta conversa</h3>
        <p className="text-sm font-medium">{usd(detail.costUsd, 4)}</p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
