import { createFileRoute } from "@tanstack/react-router";
import { CrmWorkspace } from "@/components/crm/CrmWorkspace";
import { parseExplorerSearch } from "@/lib/explorerParams";

export const Route = createFileRoute("/explorer")({
  validateSearch: parseExplorerSearch,
  head: () => ({
    meta: [
      { title: "University & Course Explorer — SS Overseas CRM" },
      {
        name: "description",
        content: "Search, filter, compare and shortlist universities and courses for students.",
      },
    ],
  }),
  component: () => <CrmWorkspace module="explorer" />,
});
