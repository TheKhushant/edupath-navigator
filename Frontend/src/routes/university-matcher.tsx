import { createFileRoute } from "@tanstack/react-router";
import { UniversityMatcher } from "@/components/crm/UniversityMatcher";

export const Route = createFileRoute("/university-matcher")({
  head: () => ({
    meta: [
      {
        title: "University Matcher — SS Overseas CRM",
      },
      {
        name: "description",
        content:
          "Find universities and courses based on student profiles.",
      },
    ],
  }),

  component: UniversityMatcher,
});