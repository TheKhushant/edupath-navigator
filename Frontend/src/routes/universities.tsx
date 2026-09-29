import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/universities")({
  head: () => ({ meta: [{ title: "Universities — SS Overseas CRM" }, { name: "description", content: "Compare verified universities and programme requirements." }, { property: "og:title", content: "Universities — SS Overseas CRM" }, { property: "og:description", content: "Compare verified universities and programme requirements." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="universities" />,
});