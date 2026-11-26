const TZ = "America/Cuiaba";

export function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(d: Date | string) {
  const date = new Date(d);
  const now = new Date();
  const day = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: TZ });
  if (day(date) === day(now)) return formatTime(date);
  const y = new Date(now.getTime() - 86_400_000);
  if (day(date) === day(y)) return "ontem";
  return date.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

export function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function usd(v: number, digits = 2) {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const ORIGIN_LABEL: Record<string, string> = {
  instagram: "Instagram",
  google: "Google / site",
  indicacao: "Indicação",
  facebook: "Facebook",
  passou_na_frente: "Passou na frente",
  ja_e_paciente: "Já é paciente",
  outro: "Outro",
};

export const EVIDENCE_LABEL: Record<string, { label: string; hint: string; className: string }> = {
  confirmada: { label: "Confirmada", hint: "Rastreada automaticamente (ex.: anúncio)", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  declarada: { label: "Declarada", hint: "O próprio paciente informou", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  inferida: { label: "Inferida", hint: "Deduzida por pistas indiretas", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  desconhecida: { label: "Desconhecida", hint: "Ainda não sabemos", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
