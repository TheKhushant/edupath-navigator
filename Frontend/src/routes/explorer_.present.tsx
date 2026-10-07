import { createFileRoute } from "@tanstack/react-router";
import { ExplorerPresentation } from "@/components/crm/ExplorerPresentation";
import { parsePresentationSearch } from "@/lib/explorerParams";

// "explorer_" keeps this page outside the explorer's CRM layout: a clean,
// printable page for students (/explorer/present?universities=…&courses=…)
export const Route = createFileRoute("/explorer_/present")({
  validateSearch: parsePresentationSearch,
  head: () => ({
    meta: [{ title: "Your study options — SS Overseas" }, { name: "robots", content: "noindex" }],
  }),
  component: ExplorerPresentation,
});
