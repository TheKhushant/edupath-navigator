import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — SS Overseas CRM" },
      { name: "description", content: "Operational overview for SS Overseas student journeys, applications, and follow-ups." },
      { property: "og:title", content: "Overview — SS Overseas CRM" },
      { property: "og:description", content: "Operational overview for SS Overseas student journeys, applications, and follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <CrmWorkspace module="dashboard" />,
});
