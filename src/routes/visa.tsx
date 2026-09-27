import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/visa")({
  head: () => ({ meta: [{ title: "Visa cases — SS Overseas CRM" }, { name: "description", content: "Monitor visa readiness, appointments, and case progress." }, { property: "og:title", content: "Visa cases — SS Overseas CRM" }, { property: "og:description", content: "Monitor visa readiness, appointments, and case progress." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="visa" />,
});