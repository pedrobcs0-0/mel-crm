import { MessagesSquare } from "lucide-react";

export default function ConversasIndex() {
  return (
    <section className="chat-bg hidden flex-1 place-items-center md:grid">
      <div className="max-w-sm text-center text-zinc-500">
        <MessagesSquare className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
        <p className="font-medium text-zinc-700">Laboratório de atendimento</p>
        <p className="mt-1 text-sm">
          Crie uma conversa de teste e escreva como se fosse um paciente. A secretária virtual responde como no WhatsApp.
        </p>
      </div>
    </section>
  );
}
