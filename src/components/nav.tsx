"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, LogOut, MessagesSquare } from "lucide-react";
import clsx from "clsx";

const LINKS = [
  { href: "/conversas", label: "Conversas", icon: MessagesSquare },
  { href: "/consumo", label: "Consumo", icon: BarChart3 },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const inChat = /^\/conversas\/.+/.test(pathname);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop: barra lateral estreita */}
      <nav className="hidden w-[72px] shrink-0 flex-col items-center gap-2 border-r border-zinc-200 bg-white py-4 md:flex">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-lg font-bold text-white">M</div>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={clsx(
                "flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition",
                active ? "bg-teal-50 text-teal-800" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button onClick={logout} title="Sair" className="mt-auto flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </nav>

      {/* Celular: barra inferior (escondida dentro de uma conversa) */}
      <nav
        className={clsx(
          "fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
          inChat && "hidden",
        )}
      >
        <div className="flex">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-xs", active ? "text-teal-800" : "text-zinc-500")}>
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
          <button onClick={logout} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-zinc-500">
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      </nav>
    </>
  );
}
