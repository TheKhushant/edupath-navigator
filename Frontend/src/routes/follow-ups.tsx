import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";

export const Route = createFileRoute("/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups — SS Overseas CRM" }, { name: "description", content: "Prioritise calls, meetings, reminders, and student follow-ups." }, { property: "og:title", content: "Follow-ups — SS Overseas CRM" }, { property: "og:description", content: "Prioritise calls, meetings, reminders, and student follow-ups." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: () => <CrmWorkspace module="follow-ups" />,
});