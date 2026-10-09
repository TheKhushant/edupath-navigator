import { useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ExternalLink } from "@/components/crm/ExternalLink";
import {
  courseTuition,
  courseUrl,
  customFieldFacts,
  filled,
  joinFilled,
  listFilled,
  looksLikeUrl,
  type Fact,
} from "@/components/crm/explorerFormat";
import type { ExcelCustomFieldDefinition, ExplorerCourse } from "@/types/crm";

/* =========================================================
   One course in the Universities "View" dialog: a compact
   header (name, degree, duration, tuition, link) that opens
   every stored field, grouped, plus the original Excel row
   exactly as it was uploaded.
========================================================= */

const fact = (label: string, value: unknown): Fact | null =>
  filled(value) ? { label, value: String(value) } : null;
const facts = (list: (Fact | null)[]) => list.filter((item): item is Fact => item !== null);

/** Label / value grid; URL values become links, long texts take the full width. */
export function FactGrid({ items }: { items: Fact[] }) {
  if (!items.length) return null;

  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "min-w-0 rounded-md border border-line/60 bg-background/60 px-3 py-2",
            item.value.length > 90 && "sm:col-span-2 lg:col-span-3",
          )}
        >
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words text-sm">
            {looksLikeUrl(item.value) ? <ExternalLink href={item.value} /> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Uploaded Excel row (header -> value), in its original column order. */
export function SourceRowTable({ row }: { row?: Record<string, unknown> | undefined }) {
  const entries = Object.entries(row ?? {}).filter(([, value]) => filled(value as string));
  if (!entries.length) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-line/60">
      <table className="w-full table-fixed text-left text-xs">
        <tbody className="divide-y divide-line/60">
          {entries.map(([header, value]) => (
            <tr key={header} className="align-top">
              <th className="w-[38%] bg-secondary/40 px-3 py-1.5 font-medium text-muted-foreground">
                {header}
              </th>
              <td className="break-words px-3 py-1.5">
                {looksLikeUrl(value) ? <ExternalLink href={value} /> : String(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UniversityCourseCard({
  course,
  open,
  onToggle,
  customFields,
}: {
  course: ExplorerCourse;
  open: boolean;
  onToggle: () => void;
  customFields: ExcelCustomFieldDefinition[];
}) {
  const [showSource, setShowSource] = useState(false);

  const overview = facts([
    fact("Degree", course.degree),
    fact("Course category", course.subjectArea || course.canonicalCourse),
    fact("Category", course.category),
    fact("Specialization", course.specialization),
    fact("Language of instruction", course.language),
    fact("Duration", joinFilled([course.duration, filled(course.ects) && `${course.ects} ECTS`])),
    fact("Intake", course.intake),
    fact("Study mode", course.studyMode),
    fact("City", course.city),
    fact("Difficulty", course.difficulty),
  ]);
  const fees = facts([
    fact("Tuition", courseTuition(course)),
    fact("Annual tuition fee", course.annualTuitionFee),
    fact("Tuition fees", course.tuitionFee),
    fact("Application fee", course.applicationFee),
  ]).filter((item, index, list) => list.findIndex((other) => other.value === item.value) === index);
  const application = facts([
    fact("Application opens", course.applicationStartDate),
    fact("Application deadline", course.applicationDeadline),
    fact("Application route", course.applicationMethod),
    fact("Admission", course.admissionMode),
  ]);
  const admission = facts([
    fact("IELTS", course.ielts),
    fact("TOEFL", course.toefl),
    fact("GRE / GMAT", course.gre),
    fact("GPA", course.minimumGpa),
    fact("Recommended Indian %", course.recommendedIndianPercentage),
    fact("Required degree", course.requiredDegree),
    fact("ECTS required", course.ectsRequired),
    fact("German requirement", course.germanRequirement),
    fact("APS required", course.apsRequired),
    fact("Work experience", course.workExperience),
    fact("Backlogs allowed", course.backlogsAllowed),
    fact("Gap allowed", course.gapAllowed),
    fact("Entrance exam", course.entranceExam),
    fact("Interview", course.interview),
    fact("Academic background required", course.eligibility),
  ]);
  const majorCourses = listFilled(course.majorCourses);
  const otherRequirements = listFilled(course.requirements);
  const additional = [
    ...customFieldFacts(course.customFields, customFields, "course"),
    ...facts(Object.entries(course.extraFields ?? {}).map(([label, value]) => fact(label, value))),
  ];
  const hasSource = Object.values(course.sourceRow ?? {}).some((value) => filled(value as string));
  const pageUrl = courseUrl(course);

  const summary = joinFilled([course.degree, course.duration, courseTuition(course)]);

  return (
    <div className="rounded-lg border border-line/60 bg-secondary/20">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <span className="min-w-0">
            <span className="block font-medium">{course.courseName}</span>
            {summary && <span className="block text-xs text-muted-foreground">{summary}</span>}
          </span>
        </button>
        {course.difficulty && <Badge variant="outline">{course.difficulty}</Badge>}
        <ExternalLink href={pageUrl} iconOnly label={`Open course page of ${course.courseName}`} />
      </div>

      {open && (
        <div className="space-y-4 border-t border-line/60 p-3">
          {overview.length > 0 && (
            <Group title="Overview">
              <FactGrid items={overview} />
            </Group>
          )}
          {fees.length > 0 && (
            <Group title="Fees">
              <FactGrid items={fees} />
            </Group>
          )}
          {application.length > 0 && (
            <Group title="Application">
              <FactGrid items={application} />
            </Group>
          )}
          {admission.length > 0 && (
            <Group title="Admission requirements">
              <FactGrid items={admission} />
            </Group>
          )}
          {majorCourses.length > 0 && (
            <Group title="Major courses">
              <div className="flex flex-wrap gap-1.5">
                {majorCourses.map((item) => (
                  <Badge key={item} variant="secondary" className="font-normal">
                    {item}
                  </Badge>
                ))}
              </div>
            </Group>
          )}
          {otherRequirements.length > 0 && (
            <Group title="Other requirements">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {otherRequirements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </Group>
          )}
          {(pageUrl || course.sourceUrl) && (
            <Group title="Links">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <ExternalLink href={course.programmeUrl}>Course page</ExternalLink>
                <ExternalLink href={course.sourceUrl}>Source page</ExternalLink>
              </div>
            </Group>
          )}
          {additional.length > 0 && (
            <Group title="Additional fields">
              <FactGrid items={additional} />
            </Group>
          )}
          {hasSource && (
            <Group title="All Excel columns">
              <button
                type="button"
                onClick={() => setShowSource((value) => !value)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Table2 className="h-3.5 w-3.5" />
                {showSource ? "Hide the uploaded row" : "Show the row exactly as uploaded"}
              </button>
              {showSource && <SourceRowTable row={course.sourceRow} />}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}
