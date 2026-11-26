import { ConversationList } from "@/components/conversation-list";
import { listConversations } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ConversasLayout({ children }: { children: React.ReactNode }) {
  const items = await listConversations();
  return (
    <div className="flex h-full">
      <ConversationList items={JSON.parse(JSON.stringify(items))} />
      {children}
    </div>
  );
}
