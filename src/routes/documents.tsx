import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/documents")({
  head: () => ({ meta: [{ title: "Documents — SS Overseas CRM" }, { name: "description", content: "Review and approve student application documents." }, { property: "og:title", content: "Documents — SS Overseas CRM" }, { property: "og:description", content: "Review and approve student application documents." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="documents" />,
});