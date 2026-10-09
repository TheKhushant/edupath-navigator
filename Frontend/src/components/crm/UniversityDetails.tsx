import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FactGrid,
  SourceRowTable,
  UniversityCourseCard,
} from "@/components/crm/UniversityCourseCard";
import { apiConfig } from "@/lib/api";
import { ExternalLink } from "@/components/crm/ExternalLink";
import { explorerService, universityImportService } from "@/services/crmServices";
import {
  customFieldFacts,
  filled,
  listFilled,
  looksLikeUrl,
  safeUrl,
  universityFacts,
  type Fact,
} from "@/components/crm/explorerFormat";
import type {
  ExcelCustomFieldDefinition,
  ExplorerCourse,
  ExplorerUniversity,
  University,
} from "@/types/crm";

/* =========================================================
   Body of the Universities "View" dialog: the university as
   stored in MongoDB (GET /explorer/universities/:id) with the
   courses linked to it. The list record is shown while the
   full record loads, and when only mock data is available.
========================================================= */

function Box({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-line/60 bg-secondary/40 p-3 ${wide ? "sm:col-span-2" : ""}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

// Fields counsellors look for; listed as "not recorded" when empty
const KEY_FIELDS: [label: string, value: (university: ExplorerUniversity) => unknown][] = [
  ["City", (university) => university.city],
  ["Ranking", (university) => university.ranking],
  ["Difficulty", (university) => university.difficulty],
  ["Tuition", (university) => university.annualTuitionFee ?? university.tuitionFeeMin],
  ["English (IELTS)", (university) => university.englishRequirement],
  ["Application opens", (university) => university.applicationOpens],
  ["Deadline", (university) => university.applicationDeadline],
  ["Website", (university) => university.website],
];

/** Same shape as the explorer record, from the list data (mock mode / fallback). */
const fromListRecord = (university: University) =>
  ({ ...university, _id: university.id, programmeCount: 0 }) as unknown as ExplorerUniversity;

export function UniversityDetails({ university }: { university: University }) {
  const [details, setDetails] = useState<ExplorerUniversity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!apiConfig.useMockData);
  const [reloadKey, setReloadKey] = useState(0);
  const [customFields, setCustomFields] = useState<ExcelCustomFieldDefinition[]>([]);
  const [openCourses, setOpenCourses] = useState<Set<string>>(new Set());
  const [courseSearch, setCourseSearch] = useState("");
  const [showUniversityRow, setShowUniversityRow] = useState(false);

  useEffect(() => {
    if (apiConfig.useMockData) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    explorerService
      .getUniversity(university.id, { includeSource: true })
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        // A single course opens straight away
        const only = data.programmes?.length === 1 ? data.programmes[0] : undefined;
        setOpenCourses(new Set(only ? [only._id] : []));
      })
      .catch(
        (loadError) =>
          !cancelled &&
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load the university",
          ),
      )
      .finally(() => !cancelled && setLoading(false));

    universityImportService
      .getCustomFields()
      .then((fields) => !cancelled && setCustomFields(fields))
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [university.id, reloadKey]);

  const record = details ?? fromListRecord(university);
  const programmes: ExplorerCourse[] = useMemo(() => details?.programmes ?? [], [details]);
  const visibleCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();
    return query
      ? programmes.filter((course) =>
          [course.courseName, course.degree, course.subjectArea, course.category]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : programmes;
  }, [programmes, courseSearch]);
  const allOpen =
    visibleCourses.length > 0 && visibleCourses.every((course) => openCourses.has(course._id));
  const toggleCourse = (id: string) =>
    setOpenCourses((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const facts: Fact[] = [
    ...universityFacts(record),
    ...(filled(record.difficulty)
      ? [{ label: "Difficulty", value: String(record.difficulty) }]
      : []),
  ];
  const missing = KEY_FIELDS.filter(([, value]) => !filled(value(record) as string)).map(
    ([label]) => label,
  );
  const website = safeUrl(record.website);
  // Other stored links (the portal is already shown as "Application method")
  const links = [{ label: "Source", url: safeUrl(record.sourceUrl) }].filter(
    (link): link is { label: string; url: string } => Boolean(link.url),
  );
  const requirements = [...listFilled(record.requirements), ...listFilled(record.documents)];
  const popular = listFilled(record.popularCourses);
  const difficultyByField = (record.admissionDifficulty ?? []).filter((item) => filled(item.field));
  const extra = [
    ...customFieldFacts(record.customFields, customFields, "university"),
    ...Object.entries(record.extraFields ?? {})
      .filter(([, value]) => filled(value as string))
      .map(([label, value]) => ({ label, value: String(value) })),
  ];
  const hasUniversityRow = Object.values(record.sourceRow ?? {}).some((value) =>
    filled(value as string),
  );

  return (
    <div className="space-y-1">
      {error && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/25 bg-danger/10 p-3 text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            Could not load the full record ({error}). Showing the list data.
          </span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw /> Retry
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {facts.map((fact) => (
          <Box key={fact.label} label={fact.label}>
            {looksLikeUrl(fact.value) ? <ExternalLink href={fact.value} /> : fact.value}
          </Box>
        ))}
        {website && (
          <Box label="Website" wide>
            <ExternalLink href={website} label={`Open ${record.name} website`} />
          </Box>
        )}
        {links.map((link) => (
          <Box key={link.label} label={link.label} wide>
            <ExternalLink href={link.url} />
          </Box>
        ))}
        {filled(record.description) && (
          <Box label="Description" wide>
            <p className="font-normal leading-relaxed">{record.description}</p>
          </Box>
        )}
      </div>

      {missing.length > 0 && !loading && (
        <p className="pt-2 text-xs text-muted-foreground">
          Not recorded yet: {missing.join(", ")}.
        </p>
      )}

      {requirements.length > 0 && (
        <>
          <SectionTitle>Requirements and documents</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {requirements.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {popular.length > 0 && (
        <>
          <SectionTitle>Popular courses</SectionTitle>
          <p className="text-sm">{popular.join(", ")}</p>
        </>
      )}

      {difficultyByField.length > 0 && (
        <>
          <SectionTitle>Admission difficulty by field</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {difficultyByField.map((item) => (
              <Box key={item.field} label={item.field}>
                {item.level || "—"}
              </Box>
            ))}
          </div>
        </>
      )}

      {extra.length > 0 && (
        <>
          <SectionTitle>Additional fields</SectionTitle>
          <FactGrid items={extra} />
        </>
      )}

      {hasUniversityRow && (
        <>
          <SectionTitle>All Excel columns of this university</SectionTitle>
          <button
            type="button"
            onClick={() => setShowUniversityRow((value) => !value)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Table2 className="h-3.5 w-3.5" />
            {showUniversityRow ? "Hide the uploaded row" : "Show the row exactly as uploaded"}
          </button>
          {showUniversityRow && (
            <div className="mt-2">
              <SourceRowTable row={record.sourceRow} />
            </div>
          )}
        </>
      )}

      {!apiConfig.useMockData && (
        <>
          <SectionTitle>Courses offered{details ? ` (${programmes.length})` : ""}</SectionTitle>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading courses from the database…
            </p>
          ) : programmes.length === 0 ? (
            <p className="rounded-md border border-dashed border-line/60 p-3 text-sm text-muted-foreground">
              {error
                ? "Courses could not be loaded."
                : "No courses are linked to this university yet. Add one under Courses → University programmes, or import a course sheet."}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {programmes.length > 5 && (
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={courseSearch}
                      onChange={(event) => setCourseSearch(event.target.value)}
                      placeholder="Search these courses…"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    setOpenCourses(
                      allOpen ? new Set() : new Set(visibleCourses.map((course) => course._id)),
                    )
                  }
                >
                  {allOpen ? "Collapse all" : "Expand all"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Click a course to see all its details.
                </span>
              </div>

              {visibleCourses.length === 0 ? (
                <p className="rounded-md border border-dashed border-line/60 p-3 text-sm text-muted-foreground">
                  No course matches "{courseSearch}".
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleCourses.map((course) => (
                    <UniversityCourseCard
                      key={course._id}
                      course={course}
                      open={openCourses.has(course._id)}
                      onToggle={() => toggleCourse(course._id)}
                      customFields={customFields}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
