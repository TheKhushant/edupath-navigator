import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — SS Overseas CRM" }, { name: "description", content: "Manage SS Overseas workspace and profile preferences." }, { property: "og:title", content: "Settings — SS Overseas CRM" }, { property: "og:description", content: "Manage SS Overseas workspace and profile preferences." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="settings" />,
});