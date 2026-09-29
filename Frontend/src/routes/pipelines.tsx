import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/pipelines")({
  head: () => ({
    meta: [
      { title: "Pipelines — SS Overseas CRM" },
      { name: "description", content: "Move students through the four SS Overseas service journeys." },
      { property: "og:title", content: "Pipelines — SS Overseas CRM" },
      { property: "og:description", content: "Move students through the four SS Overseas service journeys." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <CrmWorkspace module="pipelines" />,
});
