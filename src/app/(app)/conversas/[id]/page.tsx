import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat-view";
import { UUID_RE } from "@/lib/api";
import { getConversationDetail } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const detail = await getConversationDetail(id);
  if (!detail) notFound();
  return <ChatView key={id} initial={JSON.parse(JSON.stringify(detail))} />;
}
