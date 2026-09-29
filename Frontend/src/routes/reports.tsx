import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — SS Overseas CRM" }, { name: "description", content: "Review destinations, workload, and conversion signals." }, { property: "og:title", content: "Reports — SS Overseas CRM" }, { property: "og:description", content: "Review destinations, workload, and conversion signals." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="reports" />,
});