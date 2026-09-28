import type { ServiceType } from "@/types/crm";

export const pipelineDefinitions: Record<ServiceType, { label: string; stages: string[] }> = {
  "Study Abroad": {
    label: "Study Abroad",
    stages: ["Enquiry", "Registration", "Profile", "Shortlist", "Application", "Offer", "Visa", "Departure"],
  },
  "Germany Ausbildung": {
    label: "Germany Ausbildung",
    stages: ["Enquiry", "Eligibility", "German A1", "A2", "B1", "Documents", "Employer Applications", "Contract", "Visa"],
  },
  "Opportunity Card": {
    label: "Opportunity Card",
    stages: ["Enquiry", "Eligibility", "Qualification", "Points", "Documents", "Financial Proof", "Application", "Visa", "Arrival"],
  },
  "Language Training": {
    label: "Language Training",
    stages: ["Registration", "A1", "A2", "B1", "Goethe Preparation", "Exam"],
  },
};
