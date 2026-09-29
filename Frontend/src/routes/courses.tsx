import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [{ title: "Courses — SS Overseas CRM" }, { name: "description", content: "Manage study-abroad and vocational course pathways." }, { property: "og:title", content: "Courses — SS Overseas CRM" }, { property: "og:description", content: "Manage study-abroad and vocational course pathways." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="courses" />,
});