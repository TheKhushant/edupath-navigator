import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/assessment")({
  head: () => ({ meta: [{ title: "Assessment — SS Overseas CRM" }, { name: "description", content: "Review profile readiness and university matching recommendations." }, { property: "og:title", content: "Assessment — SS Overseas CRM" }, { property: "og:description", content: "Review profile readiness and university matching recommendations." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="assessment" />,
});