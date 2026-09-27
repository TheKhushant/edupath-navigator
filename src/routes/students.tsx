import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/students")({
  head: () => ({ meta: [{ title: "Students — SS Overseas CRM" }, { name: "description", content: "Manage student profiles and counselling journeys." }, { property: "og:title", content: "Students — SS Overseas CRM" }, { property: "og:description", content: "Manage student profiles and counselling journeys." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="students" />,
});