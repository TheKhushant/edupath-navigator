import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GraduationCap,
  MapPin,
  Wallet,
  AlertTriangle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import type {
  MatchStatus,
  UniversityMatch,
} from "@/types/crm";

interface UniversityMatchCardProps {
  match: UniversityMatch;
}

function statusClass(status: MatchStatus) {
  switch (status) {
    case "Meets Published Requirements":
      return "bg-success/15 text-success-foreground border-success/25";

    case "Matching":
      return "bg-info/15 text-info-foreground border-info/25";

    case "Requirement Review Needed":
      return "bg-warning/20 text-warning-foreground border-warning/30";

    case "Review Required":
      return "bg-danger/15 text-danger-foreground border-danger/25";

    default:
      return "bg-secondary text-muted-foreground";
  }
}

function formatMoney(
  min: number | undefined,
  max: number | undefined,
  currency: string
) {
  if (min === undefined || max === undefined) {
    return "Not available";
  }

  const formatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  });

  if (min === max) {
    return `${currency} ${formatter.format(min)}`;
  }

  return `${currency} ${formatter.format(min)} – ${formatter.format(max)}`;
}

export function UniversityMatchCard({
  match,
}: UniversityMatchCardProps) {
  return (
    <Card className="overflow-hidden shadow-none transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 shrink-0 text-brand" />

              <h3 className="truncate text-base font-semibold">
                {match.university}
              </h3>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />

              {[match.city, match.country].filter(Boolean).join(", ")}
            </div>
          </div>

          <Badge
            variant="outline"
            className={statusClass(match.status)}
          >
            {match.status}
          </Badge>
        </div>

        {/* Course */}
        <div className="mt-5 rounded-lg border border-line/60 bg-secondary/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Matching Course
          </p>

          <p className="mt-1 font-medium">
            {match.matchedCourses.join(", ") || "No course match"}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Major courses: {match.courses.join(", ") || "Not available"}
          </p>
        </div>

        {/* Financial Information */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line/60 p-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brand" />

              <p className="text-xs font-medium">
                Tuition Fee
              </p>
            </div>

            <p className="mt-2 text-sm font-semibold">
              {formatMoney(
                match.tuitionMin,
                match.tuitionMax,
                "EUR"
              )}
            </p>

            <p className="text-[11px] text-muted-foreground">
              Per year
            </p>
          </div>

          <div className="rounded-md border border-line/60 p-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brand" />

              <p className="text-xs font-medium">
                Entry Requirements
              </p>
            </div>

            <p className="mt-2 text-sm font-semibold">
              IELTS {match.englishRequirement || "not available"}
            </p>

            <p className="text-[11px] text-muted-foreground">
              Recommended Indian %: {match.recommendedIndianPercentage || "not available"}
            </p>
          </div>
        </div>

        {/* Admission Information */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Application Opens
            </div>

            <p className="mt-1 text-sm font-medium">
              {match.applicationOpens || "Not available"}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Deadline
            </div>

            <p className="mt-1 text-sm font-medium">
              {match.applicationDeadline || "Not available"}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Other Requirements
            </div>

            <p className="mt-1 text-sm font-medium">
              {match.requirements.join("; ") || "Not available"}
            </p>
          </div>
        </div>

        {/* Matched Criteria */}
        {match.matchedCriteria.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold">
              Why this matches
            </p>

            <div className="space-y-1.5">
              {match.matchedCriteria.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />

                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {match.warnings.length > 0 && (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />

              <div>
                <p className="text-xs font-semibold">
                  Counsellor review
                </p>

                <div className="mt-1 space-y-1">
                  {match.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="text-xs text-muted-foreground"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 flex flex-col gap-3 border-t border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Suggested action
            </p>

            <p className="mt-1 text-xs font-medium">
              {match.action}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                console.log("Shortlist:", match)
              }
            >
              Shortlist
            </Button>

            <Button
              size="sm"
              onClick={() =>
                console.log("Review:", match)
              }
            >
              Review
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}