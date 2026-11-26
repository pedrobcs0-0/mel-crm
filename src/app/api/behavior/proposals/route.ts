import { NextResponse } from "next/server";
import { bad, sameOrigin } from "@/lib/api";
import { generateProposal } from "@/lib/attendant/improve";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const r = await generateProposal();
  if (!r.ok) return bad(r.error);
  return NextResponse.json({ id: r.proposal.id });
}
