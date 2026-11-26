import { UsageView } from "@/components/usage-view";
import { usageReport } from "@/lib/usage/report";

export const dynamic = "force-dynamic";

export default async function ConsumoPage() {
  const report = await usageReport();
  return <UsageView report={JSON.parse(JSON.stringify(report))} />;
}
