import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments — SS Overseas CRM" }, { name: "description", content: "Track fees, balances, due dates, and receipts." }, { property: "og:title", content: "Payments — SS Overseas CRM" }, { property: "og:description", content: "Track fees, balances, due dates, and receipts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="payments" />,
});