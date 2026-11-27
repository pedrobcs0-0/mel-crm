"use client";
import { useState } from "react";
import type { LabTurn } from "@/lib/attendant/ab-lab";
type Variant = "A" | "B";
type Lane = { variant: Variant; turns: LabTurn[]; stats: {usd:number;ms:number;model:string}[]; error?: string };
export default function ComparacaoPage() {
  const [lanes,setLanes] = useState<Lane[]>([]);
  const [text,setText] = useState("");
  const [busy,setBusy] = useState(false);
  const [snapshot,setSnapshot] = useState<string>();
  const [now,setNow] = useState("");
  const [revealed,setRevealed] = useState(false);
  const [preference,setPreference] = useState("");
  const [notes,setNotes] = useState("");
  function reset() {
    if (busy) return;
    const variants: Variant[] = Math.random()<0.5?["A","B"]:["B","A"];
    setLanes(variants.map(variant=>({variant,turns:[],stats:[]})));
    setSnapshot(undefined); setNow(new Date().toISOString()); setRevealed(false); setPreference(""); setNotes(""); setText("");
  }
  async function send(target: number[]) {
    if (busy || !text.trim() || !lanes.length) return;
    setBusy(true);
    let currentSnapshot=snapshot;
    const patient=text.trim();
    setText("");
    try {
      for (const index of target) {
        const lane=lanes[index];
        if (lane.turns.length>=20 || lane.turns.some(t=>t.reply.acoes.transferir)) continue;
        try {
          const res=await fetch("/api/comparacao",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({variant:lane.variant,turns:lane.turns,patient,snapshot:currentSnapshot,now})});
          const data=await res.json();
          if (!res.ok) {
            setLanes(old=>old.map((l,i)=>i===index?{...l,error:patient+" — "+(data.error||"Falha")}:l));
            // Stop the paired run on failure; never silently retry or lose snapshot identity.
            break;
          }
          currentSnapshot=data.snapshot;setSnapshot(data.snapshot);
          setLanes(old=>old.map((l,i)=>i===index?{...l,error:undefined,turns:[...l.turns,{patient,reply:data.reply}],
            stats:[...l.stats,{usd:data.usd,ms:data.ms,model:data.model}]}:l));
        } catch {
          setLanes(old=>old.map((l,i)=>i===index?{...l,error:patient+" — Resultado incerto; não reenviar automaticamente."}:l));break;
        }
      }
    } finally {setBusy(false);}
  }
  function exportResult() {
    const blob=new Blob([JSON.stringify({snapshot,now,preference,notes,lanes},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="mel-comparacao-ab.json";a.click();URL.revokeObjectURL(url);
  }
  return <main className="h-full overflow-auto p-4 md:p-8">
    <h1 className="text-2xl font-semibold">Laboratório independente A/B</h1>
    <p className="my-2 text-sm opacity-80">Somente dados fictícios. Ações de CRM são simuladas e não são gravadas. As chamadas reais utilizam o limite de consumo existente. Não é o WhatsApp.</p>
    <div className="my-4 flex flex-wrap gap-2">
      <button className="rounded border px-3 py-2" disabled={busy} onClick={reset}>{lanes.length?"Novo teste":"Iniciar teste cego"}</button>
      <button className="rounded border px-3 py-2" disabled={busy||!lanes.length||!preference} onClick={()=>setRevealed(true)}>Revelar autoria após avaliação</button>
      <button className="rounded border px-3 py-2" disabled={busy||!lanes.length} onClick={exportResult}>Exportar resultado</button>
    </div>
    {lanes.length>0 && <>
      <div className="grid gap-4 md:grid-cols-2">
        {lanes.map((lane,index)=><section key={index} className="rounded-xl border p-3">
          <h2 className="font-semibold">Atendente {index+1}{revealed?" · "+(lane.variant==="A"?"Claude (A)":"ChatGPT (B)"):""}</h2>
          <div className="min-h-48 space-y-2 py-3">
            {lane.turns.map((turn,i)=><div key={i} className="space-y-2">
              <div className="ml-8 rounded border p-2 text-sm whitespace-pre-wrap">{turn.patient}</div>
              {turn.reply.mensagens.map((msg,j)=><div key={j} className="mr-8 rounded border bg-emerald-500/10 p-2 text-sm whitespace-pre-wrap">{msg}</div>)}
              {!turn.reply.mensagens.length&&<p className="text-xs opacity-70">Optou por não responder.</p>}
              <details className="text-xs"><summary>Ações simuladas e métricas</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(turn.reply.acoes,null,2)}</pre><p>{lane.stats[i]?.model} · {lane.stats[i]?.ms} ms · US$ {lane.stats[i]?.usd.toFixed(5)}</p></details>
              {turn.reply.acoes.transferir&&<p className="text-xs font-semibold">Transferência simulada: atendente interrompida.</p>}
            </div>)}
          </div>
          {lane.error&&<p role="alert" className="text-sm text-red-600">{lane.error}</p>}
          <p className="text-xs opacity-70">Custo medido: US$ {lane.stats.reduce((s,x)=>s+x.usd,0).toFixed(5)}</p>
        </section>)}
      </div>
      <textarea className="my-3 w-full rounded border bg-transparent p-3" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} placeholder="Mensagem do paciente fictício"/>
      <div className="flex flex-wrap gap-2">
        {[{label:"Enviar às duas",target:[0,1]},{label:"Só atendente 1",target:[0]},{label:"Só atendente 2",target:[1]}].map(x=><button key={x.label} className="rounded border px-3 py-2" disabled={busy||!text.trim()} onClick={()=>send(x.target)}>{x.label}</button>)}
      </div>
      {busy&&<p className="my-2 text-sm" role="status">Processando chamada. Não reenvie.</p>}
      <div className="my-4 space-y-2 rounded border p-3">
        <label className="block text-sm">Preferência cega<select className="ml-2 rounded border bg-transparent p-1" value={preference} onChange={e=>setPreference(e.target.value)}>
          <option value="">Selecione</option><option value="1">Atendente 1</option><option value="2">Atendente 2</option><option value="empate">Empate</option><option value="nenhuma">Nenhuma</option></select></label>
        <textarea className="w-full rounded border bg-transparent p-2" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Motivo, falhas de segurança, naturalidade, objeções..."/>
      </div>
    </>}
  </main>;
}
