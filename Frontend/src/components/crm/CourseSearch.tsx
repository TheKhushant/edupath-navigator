import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Sparkles, Tags, Trash2, X } from "lucide-react";

import { searchTagService } from "@/services/crmServices";
import type {
  Course,
  SearchAnalyticsEntry,
  SearchInfo,
  SearchMatch,
  SearchTag,
  SearchTagInput,
  SearchTagRelation,
  UniversityCourse,
} from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ExternalLink } from "@/components/crm/ExternalLink";

/* =========================================================
   Course search UI: which related tags a search used, why a
   course matched, custom tag editing, and the shared search
   tag dictionary. All terminology comes from the backend.
========================================================= */

const RELATION_LABEL: Record<SearchTagRelation, string> = {
  closely_related: "Closely related",
  broader_related: "Broader",
};

const chipTone = {
  synonym: "border-brand/30 bg-brand/10 text-brand",
  closely_related: "border-info/30 bg-info/10 text-info-foreground",
  broader_related: "border-dashed border-line text-muted-foreground",
} as const;

function TermChip({
  children,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  tone: keyof typeof chipTone;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium",
    chipTone[tone],
    onClick && "cursor-pointer hover:opacity-80",
  );

  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      <span className="truncate">{children}</span>
    </button>
  ) : (
    <span className={className}>
      <span className="truncate">{children}</span>
    </span>
  );
}

const GROUP_PREVIEW = 6;

function TermGroup({
  label,
  terms,
  tone,
}: {
  label: string;
  terms: string[];
  tone: keyof typeof chipTone;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!terms.length) return null;

  const visible = expanded ? terms : terms.slice(0, GROUP_PREVIEW);

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
      <span className="w-28 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {visible.map((term) => (
          <TermChip key={term} tone={tone}>
            {term}
          </TermChip>
        ))}
        {terms.length > GROUP_PREVIEW && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            {expanded ? "Show less" : `+${terms.length - GROUP_PREVIEW} more`}
          </button>
        )}
      </div>
    </div>
  );
}

/** "Search results for AI — related tags used: …" shown above the results table. */
export function SearchExpansionPanel({
  search,
  total,
  onSearch,
}: {
  search: SearchInfo;
  total: number;
  onSearch: (term: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const synonyms = search.expandedTerms
    .filter((item) => item.relation === "concept" || item.relation === "alias")
    .map((item) => item.term);
  const close = search.expandedTerms
    .filter((item) => item.relation === "closely_related")
    .map((item) => item.term);
  const broader = search.expandedTerms
    .filter((item) => item.relation === "broader_related")
    .map((item) => item.term);

  const partial = search.concepts.some((concept) => concept.via === "partial");

  return (
    <div className="mb-4 rounded-lg border border-line/60 bg-secondary/30 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="min-w-0">
          <span className="font-medium">
            {total} {total === 1 ? "result" : "results"} for “{search.query}”
          </span>
          {search.correctedTo && (
            <span className="text-muted-foreground">
              {" "}
              · showing matches for{" "}
              <span className="font-medium text-foreground">{search.correctedTo}</span>
            </span>
          )}
          {partial && !search.correctedTo && (
            <span className="text-muted-foreground">
              {" "}
              · includes {search.concepts.map((concept) => concept.name).join(", ")}
            </span>
          )}
        </p>

        {search.relatedTermCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            {search.relatedTermCount} related {search.relatedTermCount === 1 ? "term" : "terms"}{" "}
            used
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>
        )}
      </div>

      {open && search.relatedTermCount > 0 && (
        <div className="mt-3 grid gap-2">
          <TermGroup label="Synonyms" terms={synonyms} tone="synonym" />
          <TermGroup label="Closely related" terms={close} tone="closely_related" />
          <TermGroup label="Broader" terms={broader} tone="broader_related" />
        </div>
      )}

      {search.relatedTermCount === 0 && total > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          No related search tags are defined for this term, so only text matches are shown.
        </p>
      )}

      {total === 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {search.suggestions.length
              ? "No exact matches found. Did you mean:"
              : "No matches found."}
          </span>
          {search.suggestions.map((suggestion) => (
            <TermChip
              key={suggestion.term}
              tone="synonym"
              onClick={() => onSearch(suggestion.term)}
            >
              {suggestion.term} ({suggestion.count})
            </TermChip>
          ))}
        </div>
      )}
    </div>
  );
}

const MATCH_TONE: Record<SearchMatch["type"], string> = {
  exact: "text-success-foreground",
  specialization: "text-success-foreground",
  tag: "text-brand",
  name: "text-brand",
  related: "text-info-foreground",
  broader: "text-muted-foreground",
  text: "text-muted-foreground",
};

const MATCH_PREVIEW = 2;

/** One subtle line under a result: "Related match · Machine Learning, Deep Learning +2". */
export function MatchReason({ match }: { match: SearchMatch }) {
  const tags = match.matchedTags.map((tag) => tag.name);
  const extra = tags.length - MATCH_PREVIEW;

  return (
    // Results rows are clickable; the "+N more" popover (portaled, but React
    // events still bubble through it) must not open the row's dialog
    <div
      className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4"
      onClick={(event) => event.stopPropagation()}
    >
      <span className={cn("font-medium", MATCH_TONE[match.type])}>{match.label}</span>
      {tags.length > 0 && (
        <span className="text-muted-foreground">· {tags.slice(0, MATCH_PREVIEW).join(", ")}</span>
      )}
      {extra > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              +{extra} more
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <p className="mb-2 text-xs font-medium">Matched because of</p>
            <ul className="grid gap-1 text-xs">
              {match.matchedTags.map((tag) => (
                <li key={tag.key} className="flex justify-between gap-3">
                  <span>✓ {tag.name}</span>
                  <span className="text-muted-foreground">
                    {tag.relation === "exact" ? "Search term" : RELATION_LABEL[tag.relation]}
                  </span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/** Chip list with an input; Enter or comma adds a tag. */
function TagListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const tag = draft.replace(/\s+/g, " ").trim();
    if (tag && !value.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft("");
  };

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 font-medium">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          maxLength={60}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}

/** Concept keys stored on a course, shown with their dictionary names. */
function DerivedTags({ keys, names }: { keys: string[]; names: Map<string, string> }) {
  if (!keys.length) {
    return <p className="text-xs text-muted-foreground">No search tags detected yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => (
        <TermChip key={key} tone="synonym">
          {names.get(key) ?? key}
        </TermChip>
      ))}
    </div>
  );
}

const COURSE_FIELDS: { key: keyof Course; label: string; wide?: boolean }[] = [
  { key: "name", label: "Course name", wide: true },
  { key: "degree", label: "Degree" },
  { key: "specialization", label: "Specialization" },
  { key: "country", label: "Country" },
  { key: "field", label: "Field" },
  { key: "duration", label: "Duration" },
  { key: "language", label: "Language" },
];

type ProgrammeField = {
  key: keyof UniversityCourse;
  label: string;
  wide?: boolean;
  number?: boolean;
  placeholder?: string;
};

const PROGRAMME_FIELDS: ProgrammeField[] = [
  { key: "courseName", label: "Programme name", wide: true },
  { key: "degree", label: "Degree", placeholder: "e.g. Master of Science" },
  { key: "specialization", label: "Specialization" },
  { key: "subjectArea", label: "Course / subject", placeholder: "e.g. Computer Science" },
  { key: "language", label: "Language", placeholder: "e.g. English, German" },
  { key: "duration", label: "Duration", placeholder: "e.g. 4 semesters" },
  { key: "studyMode", label: "Study mode", placeholder: "e.g. full-time" },
  { key: "intake", label: "Intake", placeholder: "e.g. Winter semester" },
  { key: "applicationDeadline", label: "Deadline", placeholder: "e.g. 15 July" },
  { key: "applicationMethod", label: "Application method", placeholder: "e.g. uni-assist" },
  { key: "ielts", label: "IELTS", placeholder: "e.g. 6.5" },
  { key: "tuitionMin", label: "Tuition from", number: true },
  { key: "tuitionMax", label: "Tuition up to", number: true },
  { key: "tuitionCurrency", label: "Currency", placeholder: "EUR" },
  { key: "city", label: "City (if not the main campus)" },
  { key: "programmeUrl", label: "Course URL", wide: true, placeholder: "https://" },
];

export type CourseDialogState =
  | { kind: "course"; course: Partial<Course>; isNew: boolean }
  | { kind: "programme"; course: Partial<UniversityCourse>; isNew: boolean };

/**
 * Add / edit a catalogue course or a university programme, including its
 * custom search tags. Saving is delegated to the caller (it owns the
 * service calls).
 */
export function CourseDialog({
  state,
  tagNames,
  universities,
  onClose,
  onSaveCourse,
  onSaveProgramme,
}: {
  state: CourseDialogState | null;
  tagNames: Map<string, string>;
  /** Options for the programme's university (readable id + name). */
  universities: { id: string; name: string }[];
  onClose: () => void;
  onSaveCourse: (course: Partial<Course>, isNew: boolean) => Promise<void>;
  onSaveProgramme: (course: Partial<UniversityCourse>, isNew: boolean) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Course>>({});
  const [programmeForm, setProgrammeForm] = useState<Partial<UniversityCourse>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    setForm(state.kind === "course" ? state.course : {});
    setProgrammeForm(state.kind === "programme" ? state.course : {});
    setTags(state.course.customSearchTags ?? []);
    setError(null);
  }, [state]);

  if (!state) return null;

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      if (state.kind === "course") {
        if (!form.name?.trim()) throw new Error("Course name is required");
        await onSaveCourse({ ...form, customSearchTags: tags }, state.isNew);
      } else {
        if (!programmeForm.courseName?.trim()) throw new Error("Programme name is required");
        if (!programmeForm.universityId) throw new Error("Select the university");
        await onSaveProgramme({ ...programmeForm, customSearchTags: tags }, state.isNew);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  };

  const programme = state.kind === "programme";
  const universityOptions =
    programmeForm.universityId &&
    !universities.some((item) => item.id === programmeForm.universityId)
      ? [
          {
            id: programmeForm.universityId,
            name: programmeForm.universityName ?? programmeForm.universityId,
          },
          ...universities,
        ]
      : universities;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {programme
              ? state.isNew
                ? "Add programme"
                : "Edit programme"
              : state.isNew
                ? "Add course"
                : "Edit course"}
          </DialogTitle>
          <DialogDescription>
            Search tags are detected from the name and specialization; add your own for anything
            else.
          </DialogDescription>
        </DialogHeader>

        {state.kind === "course" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {COURSE_FIELDS.map(({ key, label, wide }) => (
              <label
                key={key}
                className={cn("grid gap-1.5 text-sm font-medium", wide && "sm:col-span-2")}
              >
                {label}
                <Input
                  value={String(form[key] ?? "")}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="grid gap-1.5 text-sm font-medium">
              Status
              <select
                value={form.status || "Active"}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
                className="h-9 rounded-md border border-input bg-background/60 px-3 text-sm"
              >
                <option>Active</option>
                <option>Draft</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Requirements
              <Textarea
                value={form.requirements ?? ""}
                onChange={(event) => setForm({ ...form, requirements: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Notes
              <Textarea
                value={form.notes ?? ""}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
          </div>
        )}

        {programme && (programmeForm.programmeUrl || programmeForm.sourceUrl) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line/60 bg-secondary/30 px-3 py-2 text-sm">
            <ExternalLink href={programmeForm.programmeUrl} label="Open course page">
              Course page
            </ExternalLink>
            <ExternalLink href={programmeForm.sourceUrl} label="Open source page">
              Source page
            </ExternalLink>
          </div>
        )}

        {programme && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              University
              <select
                value={programmeForm.universityId ?? ""}
                onChange={(event) =>
                  setProgrammeForm({ ...programmeForm, universityId: event.target.value })
                }
                className="h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-3 text-sm"
              >
                <option value="">Select university…</option>
                {universityOptions.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.name}
                  </option>
                ))}
              </select>
            </label>
            {PROGRAMME_FIELDS.map(({ key, label, wide, number, placeholder }) => (
              <label
                key={key}
                className={cn("grid gap-1.5 text-sm font-medium", wide && "sm:col-span-2")}
              >
                {label}
                <Input
                  type={number ? "number" : "text"}
                  min={number ? 0 : undefined}
                  value={String(programmeForm[key] ?? "")}
                  placeholder={placeholder}
                  onChange={(event) => {
                    const value = event.target.value;
                    setProgrammeForm({
                      ...programmeForm,
                      [key]: number ? (value === "" ? undefined : Number(value)) : value,
                    });
                  }}
                />
              </label>
            ))}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Admission requirements
              <Textarea
                value={programmeForm.eligibility ?? ""}
                onChange={(event) =>
                  setProgrammeForm({ ...programmeForm, eligibility: event.target.value })
                }
                placeholder="e.g. Bachelor in Computer Science, 6.5 IELTS, APS certificate"
              />
            </label>
          </div>
        )}

        <div className="grid gap-3 rounded-lg border border-line/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Tags className="h-4 w-4 text-brand" />
            Search tags
          </div>

          {!(state.kind === "course" && state.isNew) && (
            <div className="grid gap-1.5">
              <p className="text-xs text-muted-foreground">Found by (updated on save)</p>
              <DerivedTags keys={state.course.searchTags ?? []} names={tagNames} />
            </div>
          )}

          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">Custom search tags</p>
            <TagListInput value={tags} onChange={setTags} placeholder="e.g. Drones, Industry 4.0" />
          </div>
        </div>

        {error && <p className="text-sm text-danger-foreground">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   SEARCH TAG DICTIONARY MANAGER
========================================================= */

const emptyTag = (): SearchTagInput => ({
  name: "",
  aliases: [],
  related: [],
  category: "",
  status: "active",
});

const toInput = (tag: SearchTag): SearchTagInput => ({
  name: tag.name,
  aliases: tag.aliases,
  related: tag.related.map((item) => ({ tag: item.id, relation: item.relation })),
  category: tag.category ?? "",
  status: tag.status,
});

function RelatedPicker({
  relation,
  value,
  tags,
  selfId,
  onChange,
}: {
  relation: SearchTagRelation;
  value: SearchTagInput["related"];
  tags: SearchTag[];
  selfId: string | null;
  onChange: (next: SearchTagInput["related"]) => void;
}) {
  const nameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const selected = value.filter((item) => item.relation === relation);
  const taken = new Set(value.map((item) => item.tag));
  const options = tags.filter((tag) => tag.id !== selfId && !taken.has(tag.id));

  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <span className="text-sm font-medium">{RELATION_LABEL[relation]}</span>
      <div className="flex flex-wrap items-start gap-1.5">
        {selected.map((item) => (
          <Badge key={item.tag} variant="outline" className="gap-1 font-medium">
            {nameById.get(item.tag) ?? "Unknown"}
            <button
              type="button"
              onClick={() => onChange(value.filter((other) => other.tag !== item.tag))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${nameById.get(item.tag)}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <select
        value=""
        onChange={(event) =>
          event.target.value && onChange([...value, { tag: event.target.value, relation }])
        }
        className="h-9 w-full min-w-0 rounded-md border border-input bg-background/60 px-3 text-sm text-muted-foreground"
      >
        <option value="">Add {RELATION_LABEL[relation].toLowerCase()} tag…</option>
        {options.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Dictionary admin: concepts, their synonyms and related concepts, plus
 * searches that found nothing (candidates for new tags or aliases).
 */
export function SearchTagManager({
  open,
  onOpenChange,
  scope,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: "courses" | "university-courses";
  onChanged: () => void;
}) {
  const [tags, setTags] = useState<SearchTag[]>([]);
  const [zeroResults, setZeroResults] = useState<SearchAnalyticsEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SearchTagInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, analytics] = await Promise.all([
        searchTagService.getSearchTags(),
        searchTagService.getAnalytics(scope),
      ]);
      setTags(list);
      setZeroResults(analytics.zeroResultSearches);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load search tags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return tags.filter(
      (tag) =>
        !query ||
        tag.name.toLowerCase().includes(query) ||
        tag.aliases.some((alias) => alias.toLowerCase().includes(query)),
    );
  }, [tags, filter]);

  const select = (tag: SearchTag | null, name = "") => {
    setSelectedId(tag?.id ?? null);
    setForm(tag ? toInput(tag) : { ...emptyTag(), name });
    setError(null);
  };

  /** A zero-result term the dictionary already knows opens that tag instead of a duplicate. */
  const selectSearchedTerm = (query: string) => {
    const term = query.trim().toLowerCase();
    const known = tags.find(
      (tag) =>
        tag.name.toLowerCase() === term ||
        tag.aliases.some((alias) => alias.toLowerCase() === term),
    );
    select(known ?? null, query);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const saved = selectedId
        ? await searchTagService.updateSearchTag(selectedId, form)
        : await searchTagService.createSearchTag(form);
      await load();
      select(saved);
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save search tag");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !form) return;
    if (
      !window.confirm(
        `Delete the search tag "${form.name}"? Courses will no longer be found by it.`,
      )
    )
      return;

    setSaving(true);
    try {
      await searchTagService.deleteSearchTag(selectedId);
      setSelectedId(null);
      setForm(null);
      await load();
      onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete search tag");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Search tags</DialogTitle>
          <DialogDescription>
            Synonyms are treated as the same term. Closely related tags rank next, broader tags
            last. Relations apply one level deep.
          </DialogDescription>
        </DialogHeader>

        {zeroResults.length > 0 && (
          <div className="rounded-lg border border-line/60 bg-secondary/30 px-3 py-2">
            <p className="mb-1.5 text-xs text-muted-foreground">
              Searches that found nothing. Select one to open or create its tag:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {zeroResults.map((item) => (
                <TermChip
                  key={item.key}
                  tone="broader_related"
                  onClick={() => selectSearchedTerm(item.query)}
                >
                  {item.query} ×{item.zeroResultCount}
                </TermChip>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="grid content-start gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter tags..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => select(null)}>
              <Plus />
              New tag
            </Button>
            <div className="max-h-[22rem] overflow-y-auto rounded-md border border-line/60">
              {loading && <p className="p-3 text-xs text-muted-foreground">Loading...</p>}
              {!loading && visible.length === 0 && (
                <p className="p-3 text-xs text-muted-foreground">
                  No search tags. Run <code>npm run seed:search-tags</code> in Backend to load the
                  starter set.
                </p>
              )}
              {visible.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => select(tag)}
                  className={cn(
                    "block w-full border-b border-line/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/40",
                    selectedId === tag.id && "bg-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "font-medium",
                      tag.status === "inactive" && "text-muted-foreground line-through",
                    )}
                  >
                    {tag.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {tag.aliases.join(", ") || "No synonyms"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {form ? (
            <div className="grid content-start gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                    value={form.name}
                    maxLength={80}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="e.g. Artificial Intelligence"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Category
                  <Input
                    value={form.category ?? ""}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                    placeholder="e.g. Computing"
                  />
                </label>
              </div>

              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Synonyms</span>
                <TagListInput
                  value={form.aliases}
                  onChange={(aliases) => setForm({ ...form, aliases })}
                  placeholder="e.g. AI, KI, Künstliche Intelligenz"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(["closely_related", "broader_related"] as const).map((relation) => (
                  <RelatedPicker
                    key={relation}
                    relation={relation}
                    value={form.related}
                    tags={tags}
                    selfId={selectedId}
                    onChange={(related) => setForm({ ...form, related })}
                  />
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.status !== "inactive"}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.checked ? "active" : "inactive" })
                  }
                />
                Active (used by search)
              </label>

              {error && <p className="text-sm text-danger-foreground">{error}</p>}

              <div className="flex flex-wrap justify-between gap-2">
                {selectedId ? (
                  <Button variant="outline" onClick={remove} disabled={saving}>
                    <Trash2 />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <Button onClick={save} disabled={saving || !form.name.trim()}>
                  {saving ? "Saving..." : selectedId ? "Save changes" : "Create tag"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-md border border-dashed border-line/60 p-8 text-center text-sm text-muted-foreground">
              {error ?? "Select a tag to edit it, or create a new one."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
