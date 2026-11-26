"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot, Plus, UserRound, X } from "lucide-react";
import clsx from "clsx";
import type { ConversationListItem } from "@/lib/data";
import { formatRelative, initials } from "@/lib/format";

export function ConversationList({ items }: { items: ConversationListItem[] }) {
  const pathname = usePathname();
  const inChat = /^\/conversas\/.+/.test(pathname);
  const [open, setOpen] = useState(false);

  return (
    <aside
      className={clsx(
        "h-full w-full shrink-0 flex-col border-r border-zinc-200 bg-white pb-16 md:flex md:w-80 md:pb-0 lg:w-96",
        inChat ? "hidden" : "flex",
      )}
    >
      <header className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-lg font-semibold">Conversas</h1>
          <p className="text-xs text-zinc-500">Laboratório · dados fictícios</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" /> Nova
        </button>
      </header>

      <ul className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-zinc-500">
            Nenhuma conversa ainda. Toque em <b>Nova</b> para simular um paciente.
          </li>
        )}
        {items.map((c) => {
          const active = pathname === `/conversas/${c.id}`;
          return (
            <li key={c.id}>
              <Link
                href={`/conversas/${c.id}`}
                className={clsx("flex items-center gap-3 px-4 py-3 transition", active ? "bg-teal-50" : "hover:bg-zinc-50")}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
                  {c.contactName ? initials(c.contactName) : <UserRound className="h-5 w-5 text-zinc-400" />}
                </div>
                <div className="min-w-0 flex-1 border-b border-zinc-100 pb-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{c.contactName ?? c.contactPhone ?? "Contato"}</span>
                    <span className="shrink-0 text-xs text-zinc-400">{formatRelative(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-sm text-zinc-500">
                      {c.lastSender === "ia" && "Secretária: "}
                      {c.lastSender === "humano" && "Equipe: "}
                      {c.lastContent ?? "Sem mensagens"}
                    </span>
                    {c.needsHuman ? (
                      <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Atenção</span>
                    ) : !c.aiEnabled ? (
                      <span className="ml-auto shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800">Equipe</span>
                    ) : (
                      <Bot className="ml-auto h-4 w-4 shrink-0 text-teal-600" aria-label="IA ativa" />
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {open && <NewConversationDialog onClose={() => setOpen(false)} />}
    </aside>
  );
}

function NewConversationDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("desconhecida");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name || undefined, simulatedOrigin: origin }),
    });
    if (!res.ok) {
      setError("Não foi possível criar a conversa.");
      setLoading(false);
      return;
    }
    const { id } = await res.json();
    onClose();
    router.push(`/conversas/${id}`);
    router.refresh();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,420px)] rounded-2xl p-0 shadow-xl backdrop:bg-zinc-900/30 backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={create} className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Simular novo paciente</h2>
            <p className="text-sm text-zinc-500">Você escreve como o paciente; a secretária responde.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="nc-name">
          Nome no WhatsApp <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <input
          id="nc-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Juliana"
          className="mb-4 w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        />
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="nc-origin">
          Como o contato chegou
        </label>
        <select
          id="nc-origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
        >
          <option value="desconhecida">Mensagem direta (origem desconhecida)</option>
          <option value="anuncio_instagram">Clicou em anúncio do Instagram</option>
          <option value="anuncio_facebook">Clicou em anúncio do Facebook</option>
          <option value="link_site">Clicou no link do site / Google</option>
        </select>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-teal-700 py-2.5 font-medium text-white transition hover:bg-teal-800 disabled:opacity-50"
        >
          {loading ? "Criando…" : "Começar conversa"}
        </button>
      </form>
    </dialog>
  );
}
