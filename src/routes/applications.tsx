import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/applications")({
  head: () => ({ meta: [{ title: "Applications — SS Overseas CRM" }, { name: "description", content: "Track applications, deadlines, submissions, and offers." }, { property: "og:title", content: "Applications — SS Overseas CRM" }, { property: "og:description", content: "Track applications, deadlines, submissions, and offers." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="applications" />,
});