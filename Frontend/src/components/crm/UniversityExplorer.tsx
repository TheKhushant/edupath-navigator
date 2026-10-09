import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GitCompareArrows,
  LayoutGrid,
  List,
  MapPin,
  Presentation,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";

import { explorerService, universityImportService } from "@/services/crmServices";
import {
  EXPLORER_FILTER_KEYS,
  explorerApiQuery,
  explorerMode,
  parseExplorerSearch,
  type ExplorerFilterKey,
  type ExplorerPatch,
  type ExplorerSearch,
} from "@/lib/explorerParams";
import {
  presentationUrl,
  useShortlist,
  type ShortlistItem,
  type ShortlistKind,
} from "@/hooks/useShortlist";
import type {
  ExcelCustomFieldDefinition,
  ExplorerCourse,
  ExplorerFacets,
  ExplorerItems,
  ExplorerMode,
  ExplorerUniversity,
  SearchPage,
} from "@/types/crm";
import { MatchReason, SearchExpansionPanel } from "@/components/crm/CourseSearch";
import {
  countryFacts,
  courseFacts,
  customFieldFacts,
  courseLocation,
  courseTuition,
  courseUniversity,
  courseUniversityName,
  courseUrl,
  filled,
  joinFilled,
  listFilled,
  safeUrl,
  universityFacts,
  universityLocation,
  universityRanking,
  universityTuition,
  type Fact,
} from "@/components/crm/explorerFormat";
import { BulletList, FactList } from "@/components/crm/ExplorerFacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* =========================================================
   UNIVERSITY & COURSE EXPLORER
   Search (related search tags), data-driven filters, sorting
   and pagination run on the server; the URL holds the state.
========================================================= */

const PAGE_SIZE = 24;
const COMPARE_LIMIT = 4;

type Option = { value: string; label: string };

// Value ranges for numeric/date filters; the filter values themselves come from the data
const TUITION_OPTIONS: Option[] = [
  { value: "0", label: "No tuition fees" },
  { value: "1500", label: "Up to €1,500" },
  { value: "5000", label: "Up to €5,000" },
  { value: "10000", label: "Up to €10,000" },
  { value: "20000", label: "Up to €20,000" },
];

const MONTH_OPTIONS: Option[] = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

const IELTS_OPTIONS: Option[] = ["5.5", "6", "6.5", "7", "7.5"].map((value) => ({
  value,
  label: `${value} or lower`,
}));

type FilterDef = {
  key: ExplorerFilterKey;
  label: string;
  facet?: keyof ExplorerFacets;
  options?: Option[];
  placeholder?: string;
};

const FILTERS: FilterDef[] = [
  { key: "country", label: "Country", facet: "countries" },
  { key: "state", label: "State", facet: "states" },
  { key: "city", label: "City", facet: "cities" },
  { key: "universityType", label: "University type", facet: "universityTypes" },
  { key: "degree", label: "Degree", facet: "degrees" },
  { key: "subject", label: "Course / subject", facet: "subjects" },
  { key: "specialization", label: "Specialization", facet: "specializations" },
  { key: "language", label: "Language", facet: "languages" },
  { key: "intake", label: "Intake", facet: "intakes" },
  { key: "studyMode", label: "Study mode", facet: "studyModes" },
  { key: "duration", label: "Duration", facet: "durations" },
  { key: "maxTuition", label: "Tuition fee", options: TUITION_OPTIONS },
  { key: "applicationMethod", label: "Application method", facet: "applicationMethods" },
  { key: "deadlineMonth", label: "Deadline month", options: MONTH_OPTIONS },
  { key: "maxIelts", label: "IELTS required", options: IELTS_OPTIONS },
  { key: "requirement", label: "Admission requirement", placeholder: "e.g. GRE, APS, Bachelor" },
];

const filterOptions = (filter: FilterDef, facets: ExplorerFacets | null): Option[] =>
  filter.options ??
  (filter.facet && facets ? facets[filter.facet].map((value) => ({ value, label: value })) : []);

const filterLabel = (filter: FilterDef, value: string, facets: ExplorerFacets | null) =>
  filterOptions(filter, facets).find((option) => option.value === value)?.label ?? value;

function sortOptions(mode: ExplorerMode, searching: boolean): Option[] {
  return [
    { value: "", label: searching ? "Best match" : "Name (A–Z)" },
    ...(searching ? [{ value: "name", label: "Name (A–Z)" }] : []),
    ...(mode === "universities" ? [{ value: "ranking", label: "Ranking" }] : []),
    { value: "tuition", label: "Tuition (low to high)" },
    { value: "newest", label: "Recently added" },
  ];
}

const recordId = (record: { id?: string; _id: string }) => record.id || record._id;

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((word) => /^[A-ZÄÖÜ]/.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("") || name.slice(0, 2).toUpperCase();

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

type Results =
  | { mode: "universities"; page: SearchPage<ExplorerUniversity> }
  | { mode: "courses"; page: SearchPage<ExplorerCourse> };

type Detail = { kind: ShortlistKind; id: string };

/* ---------------------------------------------------------
   Filters
--------------------------------------------------------- */

function TextFilter({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(event) => event.key === "Enter" && onCommit(draft.trim())}
      className="bg-background/60"
    />
  );
}

function FilterPanel({
  search,
  facets,
  onChange,
  onClear,
}: {
  search: ExplorerSearch;
  facets: ExplorerFacets | null;
  onChange: (key: ExplorerFilterKey, value: string) => void;
  onClear: () => void;
}) {
  const active = EXPLORER_FILTER_KEYS.filter((key) => search[key]).length;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {active > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-brand hover:underline"
          >
            Clear all ({active})
          </button>
        )}
      </div>

      {FILTERS.map((filter) => {
        const value = search[filter.key] ?? "";
        const options = filterOptions(filter, facets);

        // Data-driven: a filter without values in the data is not shown
        if (!filter.placeholder && !options.length && !value) return null;
        if (value && !options.some((option) => option.value === value) && !filter.placeholder) {
          options.push({ value, label: value });
        }

        return (
          <label
            key={filter.key}
            className="grid gap-1.5 text-xs font-medium text-muted-foreground"
          >
            {filter.label}
            {filter.placeholder ? (
              <TextFilter
                value={value}
                placeholder={filter.placeholder}
                onCommit={(next) => onChange(filter.key, next)}
              />
            ) : (
              <select
                value={value}
                onChange={(event) => onChange(filter.key, event.target.value)}
                className={cn(selectClass, value && "border-brand/50")}
              >
                <option value="">Any</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------
   Cards
--------------------------------------------------------- */

function StarButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-pressed={active}
      aria-label={active ? `Remove ${label} from shortlist` : `Shortlist ${label}`}
      title={active ? "Remove from shortlist" : "Add to shortlist"}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
        active
          ? "border-warning/40 bg-warning/20 text-warning-foreground"
          : "border-line/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <Star className={cn("h-4 w-4", active && "fill-current")} />
    </button>
  );
}

function MiniFacts({ items, inline }: { items: Fact[]; inline?: boolean }) {
  if (!items.length) return null;

  return (
    <dl className={cn("grid gap-x-4 gap-y-1.5 text-xs", inline ? "sm:grid-cols-3" : "grid-cols-2")}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="truncate font-medium" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Chips({ values, limit = 4 }: { values: string[]; limit?: number }) {
  if (!values.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, limit).map((value) => (
        <span key={value} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
          {value}
        </span>
      ))}
      {values.length > limit && (
        <span className="px-1 py-0.5 text-[11px] text-muted-foreground">
          +{values.length - limit}
        </span>
      )}
    </div>
  );
}

function ResultCard({
  layout,
  onOpen,
  children,
}: {
  layout: "grid" | "list";
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) =>
        (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onOpen())
      }
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col gap-3 p-4 shadow-none transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        layout === "list" &&
          "md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center md:gap-6",
      )}
    >
      {children}
    </Card>
  );
}

function UniversityCard({
  university,
  layout,
  starred,
  searching,
  onStar,
  onOpen,
}: {
  university: ExplorerUniversity;
  layout: "grid" | "list";
  starred: boolean;
  searching: boolean;
  onStar: () => void;
  onOpen: () => void;
}) {
  const ranking = universityRanking(university.ranking);
  const facts: Fact[] = [
    { label: "Tuition", value: universityTuition(university) ?? "" },
    { label: "Deadline", value: university.applicationDeadline ?? "" },
    { label: "IELTS", value: university.englishRequirement ?? "" },
  ].filter((item) => filled(item.value));

  return (
    <ResultCard layout={layout} onOpen={onOpen}>
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-sm font-semibold text-brand">
            {initials(university.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-snug group-hover:text-brand">{university.name}</h3>
            {universityLocation(university) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{universityLocation(university)}</span>
              </p>
            )}
          </div>
          <StarButton active={starred} onClick={onStar} label={university.name} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ranking && (
            <Badge variant="outline" className="font-medium">
              {ranking}
            </Badge>
          )}
          {university.universityType && (
            <Badge variant="outline" className="font-medium">
              {university.universityType}
            </Badge>
          )}
          {university.programmeCount > 0 && (
            <Badge variant="outline" className="border-brand/30 bg-brand/5 font-medium text-brand">
              {university.programmeCount}{" "}
              {university.programmeCount === 1 ? "programme" : "programmes"}
            </Badge>
          )}
        </div>

        <Chips values={listFilled(university.popularCourses)} />
        {searching && university.searchMatch && <MatchReason match={university.searchMatch} />}
      </div>

      <MiniFacts items={facts} inline={layout === "list"} />
    </ResultCard>
  );
}

function CourseCard({
  course,
  layout,
  starred,
  searching,
  onStar,
  onOpen,
}: {
  course: ExplorerCourse;
  layout: "grid" | "list";
  starred: boolean;
  searching: boolean;
  onStar: () => void;
  onOpen: () => void;
}) {
  const facts: Fact[] = [
    { label: "Tuition", value: courseTuition(course) ?? "" },
    { label: "Intake", value: course.intake ?? "" },
    { label: "Deadline", value: course.applicationDeadline ?? "" },
  ].filter((item) => filled(item.value));
  const badges = [course.degree, course.language, course.duration, course.studyMode].filter(filled);

  return (
    <ResultCard layout={layout} onOpen={onOpen}>
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/15 text-info-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-snug group-hover:text-brand">
              {course.courseName}
            </h3>
            {courseUniversityName(course) && (
              <p className="mt-0.5 truncate text-xs font-medium">{courseUniversityName(course)}</p>
            )}
            {courseLocation(course) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{courseLocation(course)}</span>
              </p>
            )}
          </div>
          <StarButton active={starred} onClick={onStar} label={course.courseName} />
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <Badge key={badge} variant="outline" className="font-medium">
                {badge}
              </Badge>
            ))}
          </div>
        )}
        {searching && course.searchMatch && <MatchReason match={course.searchMatch} />}
      </div>

      <MiniFacts items={facts} inline={layout === "list"} />
    </ResultCard>
  );
}

/* ---------------------------------------------------------
   Details
--------------------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CountrySections({ info }: { info: ReturnType<typeof countryFacts> }) {
  return (
    <>
      {info.intakes.length > 0 && (
        <Section title="Intakes in this country">
          <BulletList items={info.intakes} />
        </Section>
      )}
      {info.steps.length > 0 && (
        <Section title="Admission steps">
          <ol className="grid gap-1 text-sm">
            {info.steps.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="w-5 shrink-0 text-muted-foreground">{index + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </Section>
      )}
      {info.documents.length > 0 && (
        <Section title="Documents usually required">
          <BulletList items={info.documents} />
        </Section>
      )}
      {info.livingCost && (
        <Section title="Living cost">
          <p className="text-sm">{info.livingCost}</p>
        </Section>
      )}
    </>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        {children}
        <ExternalLink />
      </a>
    </Button>
  );
}

function DetailSheet({
  stack,
  onClose,
  onOpen,
  onBack,
  isStarred,
  onStar,
}: {
  stack: Detail[];
  onClose: () => void;
  onOpen: (detail: Detail) => void;
  onBack: () => void;
  isStarred: (kind: ShortlistKind, id: string) => boolean;
  onStar: (item: ShortlistItem) => void;
}) {
  const detail = stack.at(-1) ?? null;
  const [data, setData] = useState<ExplorerUniversity | ExplorerCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Labels of fields added by Excel imports; without them keys are shown readable
  const [customFields, setCustomFields] = useState<ExcelCustomFieldDefinition[]>([]);
  useEffect(() => {
    universityImportService
      .getCustomFields()
      .then(setCustomFields)
      .catch(() => setCustomFields([]));
  }, []);

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setData(null);
    setError(null);

    const request =
      detail.kind === "university"
        ? explorerService.getUniversity(detail.id)
        : explorerService.getCourse(detail.id);

    request
      .then((result) => !cancelled && setData(result))
      .catch(
        (loadError) =>
          !cancelled && setError(loadError instanceof Error ? loadError.message : "Unable to load"),
      );

    return () => {
      cancelled = true;
    };
  }, [detail?.kind, detail?.id]);

  const university = detail?.kind === "university" ? (data as ExplorerUniversity | null) : null;
  const course = detail?.kind === "course" ? (data as ExplorerCourse | null) : null;

  return (
    <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {stack.length > 1 && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}

        {error && <p className="text-sm text-danger-foreground">{error}</p>}
        {!data && !error && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {university && (
          <div className="grid gap-5">
            <SheetHeader className="text-left">
              <SheetTitle className="pr-6 text-xl">{university.name}</SheetTitle>
              <SheetDescription>
                {joinFilled([
                  universityLocation(university),
                  universityRanking(university.ranking),
                ])}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={isStarred("university", recordId(university)) ? "secondary" : "default"}
                onClick={() =>
                  onStar({
                    kind: "university",
                    id: recordId(university),
                    name: university.name,
                    subtitle: universityLocation(university),
                  })
                }
              >
                <Star
                  className={cn(isStarred("university", recordId(university)) && "fill-current")}
                />
                {isStarred("university", recordId(university)) ? "Shortlisted" : "Shortlist"}
              </Button>
              {safeUrl(university.website) && (
                <LinkButton href={safeUrl(university.website)!}>Website</LinkButton>
              )}
              {safeUrl(university.sourceUrl) && (
                <LinkButton href={safeUrl(university.sourceUrl)!}>Source</LinkButton>
              )}
            </div>

            {filled(university.description) && (
              <p className="text-sm leading-relaxed">{university.description}</p>
            )}

            <Section title="Overview, fees and application">
              <FactList items={universityFacts(university)} />
            </Section>

            {listFilled(university.requirements).length + listFilled(university.documents).length >
              0 && (
              <Section title="Admission requirements">
                <BulletList
                  items={[
                    ...listFilled(university.requirements),
                    ...listFilled(university.documents),
                  ]}
                />
              </Section>
            )}

            {customFieldFacts(university.customFields, customFields, "university").length > 0 && (
              <Section title="Additional fields">
                <FactList
                  items={customFieldFacts(university.customFields, customFields, "university")}
                />
              </Section>
            )}

            {listFilled(university.popularCourses).length > 0 && (
              <Section title="Popular courses">
                <Chips values={listFilled(university.popularCourses)} limit={30} />
              </Section>
            )}

            <Section title={`Programmes (${university.programmes?.length ?? 0})`}>
              {university.programmes?.length ? (
                <div className="grid gap-2">
                  {university.programmes.map((programme) => (
                    <button
                      key={programme._id}
                      type="button"
                      onClick={() => onOpen({ kind: "course", id: recordId(programme) })}
                      className="flex items-center justify-between gap-3 rounded-md border border-line/60 px-3 py-2 text-left hover:bg-accent/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {programme.courseName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {joinFilled([
                            programme.degree,
                            programme.language,
                            programme.duration,
                            programme.applicationDeadline,
                          ])}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No programmes recorded for this university yet.
                </p>
              )}
            </Section>

            <CountrySections info={countryFacts(university.countryInfo)} />

            {filled(university.lastVerified) && (
              <p className="text-xs text-muted-foreground">
                Last verified: {university.lastVerified}
              </p>
            )}
          </div>
        )}

        {course && (
          <div className="grid gap-5">
            <SheetHeader className="text-left">
              <SheetTitle className="pr-6 text-xl">{course.courseName}</SheetTitle>
              <SheetDescription>
                {joinFilled([courseUniversityName(course), courseLocation(course)])}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={isStarred("course", recordId(course)) ? "secondary" : "default"}
                onClick={() =>
                  onStar({
                    kind: "course",
                    id: recordId(course),
                    name: course.courseName,
                    subtitle: courseUniversityName(course),
                  })
                }
              >
                <Star className={cn(isStarred("course", recordId(course)) && "fill-current")} />
                {isStarred("course", recordId(course)) ? "Shortlisted" : "Shortlist"}
              </Button>
              {courseUrl(course) && <LinkButton href={courseUrl(course)!}>Course page</LinkButton>}
              {courseUniversity(course) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onOpen({
                      kind: "university",
                      id: courseUniversity(course)!.id || courseUniversity(course)!._id,
                    })
                  }
                >
                  <Building2 /> University
                </Button>
              )}
            </div>

            <Section title="Programme">
              <FactList items={courseFacts(course)} />
            </Section>

            {(filled(course.eligibility) || listFilled(course.requirements).length > 0) && (
              <Section title="Admission requirements">
                {filled(course.eligibility) && (
                  <p className="text-sm leading-relaxed">{course.eligibility}</p>
                )}
                <BulletList items={listFilled(course.requirements)} />
              </Section>
            )}

            {listFilled(course.majorCourses).length > 0 && (
              <Section title="Major courses">
                <Chips values={listFilled(course.majorCourses)} limit={30} />
              </Section>
            )}

            {customFieldFacts(course.customFields, customFields, "course").length > 0 && (
              <Section title="Additional fields">
                <FactList items={customFieldFacts(course.customFields, customFields, "course")} />
              </Section>
            )}

            {courseUniversity(course) && (
              <Section title="University application details">
                <FactList
                  items={[
                    { label: "Application portal", value: courseUniversity(course)?.portal ?? "" },
                    {
                      label: "English (IELTS)",
                      value: courseUniversity(course)?.englishRequirement ?? "",
                    },
                    { label: "APS", value: courseUniversity(course)?.aps ?? "" },
                    {
                      label: "Application fee",
                      value: courseUniversity(course)?.applicationFee ?? "",
                    },
                    { label: "Scholarship", value: courseUniversity(course)?.scholarship ?? "" },
                    { label: "Part-time work", value: courseUniversity(course)?.partTime ?? "" },
                    {
                      label: "Post-study work",
                      value: courseUniversity(course)?.postStudyWork ?? "",
                    },
                  ].filter((item) => filled(item.value))}
                />
              </Section>
            )}

            <CountrySections info={countryFacts(course.countryInfo)} />

            {filled(course.notes) && (
              <Section title="Notes">
                <p className="text-sm leading-relaxed">{course.notes}</p>
              </Section>
            )}
            {filled(course.lastVerified) && (
              <p className="text-xs text-muted-foreground">Last verified: {course.lastVerified}</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------------------------------------------------
   Compare
--------------------------------------------------------- */

function CompareDialog({
  open,
  onOpenChange,
  shortlist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortlist: ShortlistItem[];
}) {
  const counts = {
    university: shortlist.filter((item) => item.kind === "university").length,
    course: shortlist.filter((item) => item.kind === "course").length,
  };
  const [kind, setKind] = useState<ShortlistKind>("course");
  const [items, setItems] = useState<ExplorerItems | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setKind(counts.course >= 2 || counts.university < 2 ? "course" : "university");
  }, [open]);

  const ids = shortlist
    .filter((item) => item.kind === kind)
    .slice(0, COMPARE_LIMIT)
    .map((item) => item.id);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!open || !ids.length) return;
    let cancelled = false;
    setItems(null);
    setError(null);

    explorerService
      .getItems(
        kind === "course" ? { universities: [], courses: ids } : { universities: ids, courses: [] },
      )
      .then((result) => !cancelled && setItems(result))
      .catch(
        (loadError) =>
          !cancelled && setError(loadError instanceof Error ? loadError.message : "Unable to load"),
      );

    return () => {
      cancelled = true;
    };
  }, [open, kind, idsKey]);

  const columns: { key: string; title: string; subtitle: string; facts: Fact[] }[] =
    kind === "course"
      ? (items?.courses ?? []).map((course) => ({
          key: course._id,
          title: course.courseName,
          subtitle: joinFilled([courseUniversityName(course), courseLocation(course)]),
          facts: courseFacts(course),
        }))
      : (items?.universities ?? []).map((university) => ({
          key: university._id,
          title: university.name,
          subtitle: universityLocation(university),
          facts: [
            ...universityFacts(university),
            ...(university.programmeCount
              ? [{ label: "Programmes", value: String(university.programmeCount) }]
              : []),
          ],
        }));

  // Rows that at least one column has, in first-seen order
  const labels = [...new Set(columns.flatMap((column) => column.facts.map((item) => item.label)))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare</DialogTitle>
          <DialogDescription>
            Side by side for up to {COMPARE_LIMIT} shortlisted{" "}
            {kind === "course" ? "courses" : "universities"}.
          </DialogDescription>
        </DialogHeader>

        {counts.course > 0 && counts.university > 0 && (
          <Tabs value={kind} onValueChange={(value) => setKind(value as ShortlistKind)}>
            <TabsList>
              <TabsTrigger value="course">Courses ({counts.course})</TabsTrigger>
              <TabsTrigger value="university">Universities ({counts.university})</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {error && <p className="text-sm text-danger-foreground">{error}</p>}
        {!error && ids.length < 2 && (
          <p className="text-sm text-muted-foreground">Shortlist at least two to compare them.</p>
        )}
        {!error && ids.length >= 2 && !items && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}

        {columns.length >= 2 && (
          <div className="overflow-x-auto rounded-lg border border-line/60">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="w-40 px-3 py-3" />
                  {columns.map((column) => (
                    <th key={column.key} className="px-3 py-3 align-top">
                      <p className="font-semibold">{column.title}</p>
                      {column.subtitle && (
                        <p className="text-xs font-normal text-muted-foreground">
                          {column.subtitle}
                        </p>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {labels.map((label) => (
                  <tr key={label}>
                    <th className="px-3 py-2 align-top text-xs font-medium text-muted-foreground">
                      {label}
                    </th>
                    {columns.map((column) => (
                      <td key={column.key} className="px-3 py-2 align-top">
                        {column.facts.find((item) => item.label === label)?.value ?? (
                          <span className="text-muted-foreground">Not recorded</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------
   Present / share
--------------------------------------------------------- */

function PresentDialog({
  open,
  onOpenChange,
  shortlist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortlist: ShortlistItem[];
}) {
  const [student, setStudent] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const url = typeof window === "undefined" ? "" : presentationUrl(shortlist, student);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Present to a student</DialogTitle>
          <DialogDescription>
            A clean, printable page with the {shortlist.length} shortlisted{" "}
            {shortlist.length === 1 ? "option" : "options"}. The link opens the same page anywhere.
          </DialogDescription>
        </DialogHeader>

        <label className="grid gap-1.5 text-sm font-medium">
          Student name (optional)
          <Input
            value={student}
            onChange={(event) => setStudent(event.target.value)}
            placeholder="e.g. Aarav Sharma"
          />
        </label>

        <div className="flex min-w-0 items-center gap-2 rounded-md border border-line/60 bg-secondary/30 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={copy}>
            <Copy />
            {copied ? "Link copied" : "Copy link"}
          </Button>
          <Button onClick={() => window.open(url, "_blank", "noopener")}>
            <Presentation />
            Open presentation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortlistBar({
  items,
  onOpen,
  onRemove,
  onClear,
  onCompare,
  onPresent,
}: {
  items: ShortlistItem[];
  onOpen: (item: ShortlistItem) => void;
  onRemove: (item: ShortlistItem) => void;
  onClear: () => void;
  onCompare: () => void;
  onPresent: () => void;
}) {
  if (!items.length) return null;

  const comparable =
    items.filter((item) => item.kind === "course").length >= 2 ||
    items.filter((item) => item.kind === "university").length >= 2;

  return (
    <div className="fixed inset-x-3 bottom-20 z-30 md:bottom-6 md:left-[calc(16rem+1.5rem)] md:right-6 lg:left-auto lg:right-8 lg:w-auto">
      <div className="workspace-glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 lg:rounded-full">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold hover:bg-accent/50"
            >
              <Star className="h-4 w-4 fill-warning text-warning-foreground" />
              {items.length} shortlisted
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <ul className="grid max-h-72 gap-1 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
                >
                  {item.kind === "course" ? (
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    {item.subtitle && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(item)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onClear}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent/40"
            >
              Clear shortlist
            </button>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onCompare}
            disabled={!comparable}
            title={
              comparable ? "Compare shortlisted options" : "Shortlist two of a kind to compare"
            }
          >
            <GitCompareArrows />
            Compare
          </Button>
          <Button size="sm" onClick={onPresent}>
            <Presentation />
            Present
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Page
--------------------------------------------------------- */

export function UniversityExplorer() {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const search = useMemo(() => parseExplorerSearch(rawSearch), [rawSearch]);
  const navigate = useNavigate();

  const mode = explorerMode(search);
  const layout: "grid" | "list" = search.view === "list" ? "list" : "grid";
  const page = Math.max(1, Number.parseInt(search.page ?? "1", 10) || 1);
  const apiQuery = explorerApiQuery(search, PAGE_SIZE);

  const [text, setText] = useState(search.q ?? "");
  const [facets, setFacets] = useState<ExplorerFacets | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [details, setDetails] = useState<Detail[]>([]);
  const [comparing, setComparing] = useState(false);
  const [presenting, setPresenting] = useState(false);

  const shortlist = useShortlist();

  /** Updates the URL; any change except paging goes back to page 1. */
  const update = (patch: ExplorerPatch, keepPage = false) => {
    const merged: ExplorerPatch = { ...search, ...patch };
    const next: ExplorerSearch = {};
    if (!keepPage) delete merged.page;
    (Object.keys(merged) as (keyof ExplorerSearch)[]).forEach((key) => {
      const value = merged[key];
      if (value) next[key] = value;
    });
    navigate({ to: "/explorer", search: next, replace: !keepPage });
  };

  // Search box -> URL (debounced); URL -> search box (back/forward, links)
  useEffect(() => setText(search.q ?? ""), [search.q]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text.trim() !== (search.q ?? "")) update({ q: text.trim(), sort: undefined });
    }, 350);
    return () => clearTimeout(timer);
  }, [text, search]);

  useEffect(() => {
    explorerService
      .getFacets()
      .then(setFacets)
      .catch((loadError) => console.error("Failed to load filters:", loadError));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const request: Promise<Results> =
      mode === "courses"
        ? explorerService
            .searchCourses(apiQuery)
            .then((result) => ({ mode: "courses" as const, page: result }))
        : explorerService
            .searchUniversities(apiQuery)
            .then((result) => ({ mode: "universities" as const, page: result }));

    request
      .then((next) => !cancelled && setResults(next))
      .catch((loadError) => {
        if (cancelled) return;
        console.error("Explorer search failed:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Unable to load results");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [mode, apiQuery, reloadKey]);

  const current = results?.mode === mode ? results : null;
  const total = current?.page.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchInfo = current?.page.search ?? null;
  const activeFilters = FILTERS.filter((filter) => search[filter.key]);
  const noun =
    mode === "courses"
      ? total === 1
        ? "course"
        : "courses"
      : total === 1
        ? "university"
        : "universities";

  const changeFilter = (key: ExplorerFilterKey, value: string) =>
    update({ [key]: value || undefined });
  const clearFilters = () =>
    update(
      Object.fromEntries(EXPLORER_FILTER_KEYS.map((key) => [key, undefined])) as ExplorerPatch,
    );

  const openDetail = (detail: Detail) => setDetails((stack) => [...stack, detail]);

  const filterPanel = (
    <FilterPanel search={search} facets={facets} onChange={changeFilter} onClear={clearFilters} />
  );

  return (
    <div className="workspace-rise pb-28">
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          SS Overseas CRM
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          University &amp; Course Explorer
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search, filter and compare study options, shortlist the best fits and present them to
          students.
        </p>
      </div>

      <Tabs
        value={mode}
        onValueChange={(value) =>
          update({ mode: value === "courses" ? "courses" : undefined, sort: undefined })
        }
      >
        <TabsList>
          <TabsTrigger value="universities" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Universities
          </TabsTrigger>
          <TabsTrigger value="courses" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Courses
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              mode === "courses"
                ? "Search courses, specializations, subjects or keywords (e.g. AI)..."
                : "Search universities, cities or courses they offer (e.g. AI)..."
            }
            className="bg-background/60 pl-9"
            aria-label="Search"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal />
            Filters{activeFilters.length > 0 && ` (${activeFilters.length})`}
          </Button>
          <select
            value={search.sort ?? ""}
            onChange={(event) => update({ sort: event.target.value || undefined })}
            className={cn(selectClass, "w-auto min-w-36 flex-1 sm:flex-none")}
            aria-label="Sort"
          >
            {sortOptions(mode, Boolean(search.q)).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div
            className="hidden rounded-md border border-input p-0.5 sm:flex"
            role="group"
            aria-label="Layout"
          >
            {(["grid", "list"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ view: value === "list" ? "list" : undefined }, true)}
                aria-pressed={layout === value}
                aria-label={value === "grid" ? "Grid view" : "List view"}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded text-muted-foreground",
                  layout === value && "bg-secondary text-foreground",
                )}
              >
                {value === "grid" ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <List className="h-4 w-4" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => changeFilter(filter.key, "")}
              className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/15"
            >
              {filter.label}: {filterLabel(filter, search[filter.key] ?? "", facets)}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="px-1 text-xs font-medium text-muted-foreground hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            {filterPanel}
          </div>
        </aside>

        <section className="min-w-0">
          {searchInfo && !error && (
            <SearchExpansionPanel
              search={searchInfo}
              total={total}
              onSearch={(term) => {
                setText(term);
                update({ q: term, sort: undefined });
              }}
            />
          )}

          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {current ? (
                total > 0 ? (
                  <>
                    <span className="font-semibold text-foreground">{total.toLocaleString()}</span>{" "}
                    {noun}
                    {total > PAGE_SIZE &&
                      ` · showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}`}
                  </>
                ) : (
                  `No ${noun} found`
                )
              ) : (
                " "
              )}
            </p>
            {loading && current && (
              <span className="text-xs text-muted-foreground">Updating...</span>
            )}
          </div>

          {error ? (
            <Card className="flex flex-col items-center gap-3 p-10 text-center shadow-none">
              <p className="font-semibold">Unable to load results</p>
              <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Try again
              </Button>
            </Card>
          ) : !current ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : total === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-10 text-center shadow-none">
              <p className="font-semibold">
                No matching {mode === "courses" ? "courses" : "universities"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Try a broader search or remove a filter.
                {mode === "universities"
                  ? " Courses are searched separately in the Courses tab."
                  : ""}
              </p>
              {activeFilters.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </Card>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 gap-3 transition-opacity",
                layout === "grid" && "sm:grid-cols-2 2xl:grid-cols-3",
                loading && "opacity-60",
              )}
            >
              {current.mode === "universities"
                ? current.page.data.map((university) => (
                    <UniversityCard
                      key={university._id}
                      university={university}
                      layout={layout}
                      searching={Boolean(searchInfo)}
                      starred={shortlist.has("university", recordId(university))}
                      onStar={() =>
                        shortlist.toggle({
                          kind: "university",
                          id: recordId(university),
                          name: university.name,
                          subtitle: universityLocation(university),
                        })
                      }
                      onOpen={() => openDetail({ kind: "university", id: recordId(university) })}
                    />
                  ))
                : current.page.data.map((course) => (
                    <CourseCard
                      key={course._id}
                      course={course}
                      layout={layout}
                      searching={Boolean(searchInfo)}
                      starred={shortlist.has("course", recordId(course))}
                      onStar={() =>
                        shortlist.toggle({
                          kind: "course",
                          id: recordId(course),
                          name: course.courseName,
                          subtitle: courseUniversityName(course),
                        })
                      }
                      onOpen={() => openDetail({ kind: "course", id: recordId(course) })}
                    />
                  ))}
            </div>
          )}

          {current && total > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : undefined }, true)}
              >
                <ChevronLeft /> Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || loading}
                onClick={() => update({ page: String(page + 1) }, true)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          )}
        </section>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-sm">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              {total.toLocaleString()} {noun}
            </SheetDescription>
          </SheetHeader>
          {filterPanel}
          <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
            Show results <ArrowRight />
          </Button>
        </SheetContent>
      </Sheet>

      <DetailSheet
        stack={details}
        onClose={() => setDetails([])}
        onOpen={openDetail}
        onBack={() => setDetails((stack) => stack.slice(0, -1))}
        isStarred={shortlist.has}
        onStar={shortlist.toggle}
      />

      <CompareDialog open={comparing} onOpenChange={setComparing} shortlist={shortlist.items} />
      <PresentDialog open={presenting} onOpenChange={setPresenting} shortlist={shortlist.items} />

      <ShortlistBar
        items={shortlist.items}
        onOpen={(item) => setDetails([{ kind: item.kind, id: item.id }])}
        onRemove={(item) => shortlist.remove(item.kind, item.id)}
        onClear={shortlist.clear}
        onCompare={() => setComparing(true)}
        onPresent={() => setPresenting(true)}
      />
    </div>
  );
}
