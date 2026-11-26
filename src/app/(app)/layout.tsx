import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Nav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
