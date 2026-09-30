import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  GraduationCap,
  MapPin,
  Search,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import { countryService, studentService, universityService } from "@/services/crmServices";
import { isSheet2HeaderRow, matchUniversities } from "@/services/universityMatcher";
import type {
  Country,
  LivingBudget,
  MatchStatus,
  Student,
  University,
  UniversityMatch,
} from "@/types/crm";

const MATCH_STATUSES: MatchStatus[] = [
  "Meets Published Requirements",
  "Matching",
  "Requirement Review Needed",
  "Review Required",
];

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

function formatLivingBudget(budget?: LivingBudget) {
  if (!budget) return undefined;

  const formatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  });

  const amount =
    budget.min === budget.max
      ? `${budget.currency} ${formatter.format(budget.min)}`
      : `${budget.currency} ${formatter.format(budget.min)} – ${formatter.format(budget.max)}`;

  return `${amount} / ${budget.period}`;
}

function formatTuition(min?: number, max?: number) {
  if (min === undefined || max === undefined) return undefined;

  const formatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  });

  const amount =
    min === max
      ? `EUR ${formatter.format(min)}`
      : `EUR ${formatter.format(min)} – ${formatter.format(max)}`;

  return `${amount} / Year`;
}

/** The note after the range in Sheet2 tuition text, e.g. "(Semester contribution)". */
function tuitionNote(annualTuitionFee?: string) {
  return annualTuitionFee?.match(/\(([^)]*)\)/)?.[1];
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line/60 bg-secondary/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-foreground">{value || "Not available"}</p>
    </div>
  );
}

function profileFromStudent(student?: Student) {
  return {
    desiredCourse: student?.desiredCourse ?? "",
    preferredCountries: student?.preferredCountries?.join(", ") ?? "",
    budget: student?.budget ?? "",
  };
}

export function UniversityMatcher() {
  const navigate = useNavigate();

  const [students, setStudents] = useState<Student[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [editableProfile, setEditableProfile] = useState(profileFromStudent());

  const [isProfileEditing, setIsProfileEditing] = useState(false);

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<UniversityMatch | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [studentData, universityData, countryData] = await Promise.all([
        studentService.getStudents(),
        universityService.getUniversities(),
        countryService.getCountries(),
      ]);

      setStudents(studentData);
      setUniversities(universityData);
      setCountries(countryData);

      const firstStudent = studentData[0];
      setSelectedStudentId((current) =>
        studentData.some((student) => student.id === current) ? current : (firstStudent?.id ?? ""),
      );
      setEditableProfile((current) =>
        current.desiredCourse || current.preferredCountries || current.budget
          ? current
          : profileFromStudent(firstStudent),
      );
    } catch (error) {
      console.error("Failed to load University Matcher data:", error);
      setLoadError(error instanceof Error ? error.message : "Unable to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const universityCount = useMemo(
    () => universities.filter((university) => !isSheet2HeaderRow(university)).length,
    [universities],
  );

  const selectedStudent = useMemo<Student | undefined>(() => {
    const student = students.find((student) => student.id === selectedStudentId);

    if (!student) return undefined;

    return {
      ...student,
      desiredCourse: editableProfile.desiredCourse,
      preferredCountries: editableProfile.preferredCountries
        .split(",")
        .map((country) => country.trim())
        .filter(Boolean),
      budget: editableProfile.budget,
    };
  }, [students, selectedStudentId, editableProfile]);

  const [countryFilter, setCountryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [opensFilter, setOpensFilter] = useState("All");

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: string }) => {
    const isActive = sortConfig?.key === sortKey;

    return (
      <button
        type="button"
        onClick={() => handleSort(sortKey)}
        className="flex items-center gap-1.5 font-medium hover:text-primary"
      >
        <span>{label}</span>

        {isActive ? (
          sortConfig.direction === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    );
  };

  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return {
          key,
          direction: "asc",
        };
      }

      if (current.direction === "asc") {
        return {
          key,
          direction: "desc",
        };
      }

      return null;
    });
  };

  const matches = useMemo(() => {
    if (!selectedStudent || !hasSearched) {
      return [];
    }

    return matchUniversities(selectedStudent, universities, countries);
  }, [selectedStudent, universities, countries, hasSearched]);

  const filteredMatches = useMemo(() => {
    const query = search.toLowerCase().trim();

    return matches.filter((match) => {
      const matchesSearch =
        !query ||
        match.university.toLowerCase().includes(query) ||
        match.country.toLowerCase().includes(query) ||
        (match.city ?? "").toLowerCase().includes(query) ||
        match.courses.some((course) => course.toLowerCase().includes(query));

      const matchesCountry = countryFilter === "All" || match.country === countryFilter;

      const matchesStatus = statusFilter === "All" || match.status === statusFilter;

      const matchesOpens = opensFilter === "All" || match.applicationOpens === opensFilter;

      return matchesSearch && matchesCountry && matchesStatus && matchesOpens;
    });
  }, [matches, search, countryFilter, statusFilter, opensFilter]);

  const canSearch = !isLoading && !loadError && Boolean(selectedStudent);

  const handleSearch = () => {
    setHasSearched(true);
  };

  const handleSearchOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && canSearch) {
      event.preventDefault();
      handleSearch();
    }
  };

  const sortedMatches = useMemo(() => {
    if (!sortConfig) return filteredMatches;

    return [...filteredMatches].sort((a, b) => {
      const { key, direction } = sortConfig;

      let valueA: string | number = "";
      let valueB: string | number = "";

      switch (key) {
        case "university":
          valueA = a.university;
          valueB = b.university;
          break;

        case "country":
          valueA = `${a.country} ${a.city ?? ""}`;
          valueB = `${b.country} ${b.city ?? ""}`;
          break;

        case "course":
          valueA = a.matchedCourses.join(", ");
          valueB = b.matchedCourses.join(", ");
          break;

        case "tuition":
          valueA = a.tuitionMax ?? Number.MAX_SAFE_INTEGER;
          valueB = b.tuitionMax ?? Number.MAX_SAFE_INTEGER;
          break;

        case "living":
          valueA = a.livingBudget?.min ?? Number.MAX_SAFE_INTEGER;
          valueB = b.livingBudget?.min ?? Number.MAX_SAFE_INTEGER;
          break;

        case "status":
          valueA = MATCH_STATUSES.indexOf(a.status);
          valueB = MATCH_STATUSES.indexOf(b.status);
          break;

        case "ielts":
          valueA = a.englishRequirement ?? "";
          valueB = b.englishRequirement ?? "";
          break;

        case "percentage":
          valueA = a.recommendedIndianPercentage ?? "";
          valueB = b.recommendedIndianPercentage ?? "";
          break;

        case "deadline":
          valueA = a.applicationDeadline ?? "";
          valueB = b.applicationDeadline ?? "";
          break;

        default:
          return 0;
      }

      const comparison = String(valueA).localeCompare(String(valueB), undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return direction === "asc" ? comparison : -comparison;
    });
  }, [filteredMatches, sortConfig]);

  return (
    <div className="min-h-screen bg-canvas p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
                <ArrowLeft />
                Back
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  University Matcher
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                  Find universities and courses based on student profile.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Student Selection */}
        <Card className="mb-5 shadow-none">
          <CardHeader className="border-b border-line/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Student Profile</CardTitle>

              {isProfileEditing && (
                <span className="text-xs text-warning-foreground">Unsaved changes</span>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-4">
            <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1.3fr_1fr_auto_auto]">
              {/* Student */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Student
                </label>

                <select
                  value={selectedStudentId}
                  disabled={isLoading || students.length === 0}
                  onChange={(event) => {
                    const studentId = event.target.value;

                    setSelectedStudentId(studentId);

                    const student = students.find((item) => item.id === studentId);

                    if (student) {
                      setEditableProfile(profileFromStudent(student));
                    }

                    setHasSearched(false);
                    setSelectedMatch(null);
                    setIsProfileEditing(false);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  {isLoading && <option value="">Loading students...</option>}

                  {!isLoading && students.length === 0 && (
                    <option value="">No students found</option>
                  )}

                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desired Course */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Desired Course
                </label>

                <Input
                  value={editableProfile.desiredCourse}
                  onChange={(event) => {
                    setEditableProfile((current) => ({
                      ...current,
                      desiredCourse: event.target.value,
                    }));

                    setIsProfileEditing(true);
                  }}
                  placeholder="e.g. Computer Science"
                  onKeyDown={handleSearchOnEnter}
                  className="h-9"
                />
              </div>

              {/* Preferred Countries */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Preferred Countries
                </label>

                <Input
                  value={editableProfile.preferredCountries}
                  onChange={(event) => {
                    setEditableProfile((current) => ({
                      ...current,
                      preferredCountries: event.target.value,
                    }));

                    setIsProfileEditing(true);
                  }}
                  placeholder="Germany"
                  onKeyDown={handleSearchOnEnter}
                  className="h-9"
                />

                <p className="mt-1 text-[10px] text-muted-foreground">
                  Separate countries with commas
                </p>
              </div>

              {/* Budget */}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Budget
                </label>

                <Input
                  value={editableProfile.budget}
                  onChange={(event) => {
                    setEditableProfile((current) => ({
                      ...current,
                      budget: event.target.value,
                    }));

                    setIsProfileEditing(true);
                  }}
                  placeholder="e.g. EUR 5,000"
                  onKeyDown={handleSearchOnEnter}
                  className="h-9"
                />

                <p className="mt-1 text-[10px] text-muted-foreground">
                  Tuition is compared only for budgets in EUR
                </p>
              </div>

              {/* Save Changes */}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full"
                  disabled={!isProfileEditing}
                  onClick={() => {
                    setHasSearched(false);
                    setSelectedMatch(null);
                    setIsProfileEditing(false);
                  }}
                >
                  Save Changes
                </Button>
              </div>

              {/* Find Universities */}
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="h-9 w-full"
                  onClick={handleSearch}
                  disabled={!canSearch}
                >
                  <Search className="h-4 w-4" />
                  Find Universities
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Load Error */}
        {loadError && (
          <Card className="mb-5 border-danger/25 shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-danger" />

              <h2 className="mt-3 font-semibold">Unable to load university data</h2>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>

              <Button variant="outline" size="sm" className="mt-4" onClick={loadData}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {hasSearched && !loadError && (
          <Card className="overflow-hidden shadow-none">
            <CardHeader className="border-b border-line/60">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">University Matches</CardTitle>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {filteredMatches.length} of {universityCount} universities matched for{" "}
                    {selectedStudent?.name}.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Search */}
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search university, city or course..."
                      className="pl-9"
                    />
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap gap-2">
                    {/* Country */}
                    <select
                      value={countryFilter}
                      onChange={(event) => setCountryFilter(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="All">All Countries</option>

                      {[...new Set(matches.map((match) => match.country))].sort().map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>

                    {/* Status */}
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="All">All Matches</option>

                      {MATCH_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>

                    {/* Application Opens */}
                    <select
                      value={opensFilter}
                      onChange={(event) => setOpensFilter(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="All">All Application Openings</option>

                      {[
                        ...new Set(
                          matches
                            .map((match) => match.applicationOpens)
                            .filter((opens): opens is string => Boolean(opens)),
                        ),
                      ]
                        .sort()
                        .map((opens) => (
                          <option key={opens} value={opens}>
                            {opens}
                          </option>
                        ))}
                    </select>

                    {/* Reset */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setCountryFilter("All");
                        setStatusFilter("All");
                        setOpensFilter("All");
                      }}
                    >
                      Reset Filters
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredMatches.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-left text-sm">
                    <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="University" sortKey="university" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Location" sortKey="country" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Matching Courses" sortKey="course" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Tuition Fee" sortKey="tuition" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Living Budget" sortKey="living" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="IELTS" sortKey="ielts" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Indian %" sortKey="percentage" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Deadline" sortKey="deadline" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Status" sortKey="status" />
                        </th>

                        <th className="px-5 py-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-line/60">
                      {sortedMatches.map((match) => (
                        <tr
                          key={match.universityId}
                          className="transition-colors hover:bg-accent/40"
                        >
                          {/* University */}
                          <td className="px-5 py-4">
                            <div className="min-w-[200px]">
                              <p className="font-semibold">{match.university}</p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {match.universityId}
                              </p>
                            </div>
                          </td>

                          {/* Location */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{match.country}</span>
                            </div>

                            {match.city && (
                              <p className="mt-1 pl-5 text-xs text-muted-foreground">
                                {match.city}
                              </p>
                            )}
                          </td>

                          {/* Course */}
                          <td className="px-5 py-4">
                            <div className="max-w-[220px]">
                              <p className="font-medium">
                                {match.matchedCourses.join(", ") || "No course match"}
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {match.courses.length} listed courses
                              </p>
                            </div>
                          </td>

                          {/* Tuition */}
                          <td className="px-5 py-4">
                            <div className="min-w-[150px]">
                              <p className="font-medium">
                                {formatTuition(match.tuitionMin, match.tuitionMax) ??
                                  "Not available"}
                              </p>

                              {tuitionNote(match.annualTuitionFee) && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {tuitionNote(match.annualTuitionFee)}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Living Budget */}
                          <td className="px-5 py-4">
                            <div className="min-w-[140px]">
                              <p className="font-medium">
                                {formatLivingBudget(match.livingBudget) ?? "Not available"}
                              </p>

                              {match.livingBudget && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {match.country}-wide
                                </p>
                              )}
                            </div>
                          </td>

                          {/* IELTS */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {match.englishRequirement || "Not available"}
                          </td>

                          {/* Recommended Indian % */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            {match.recommendedIndianPercentage || "Not available"}
                          </td>

                          {/* Deadline */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                              {match.applicationDeadline || "Not available"}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            <Badge variant="outline" className={statusClass(match.status)}>
                              {match.status}
                            </Badge>
                          </td>

                          {/* Action */}
                          <td className="px-5 py-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedMatch(match)}
                            >
                              More Details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />

                  <h3 className="mt-3 font-semibold">
                    {universityCount === 0
                      ? "No university data available"
                      : "No universities found"}
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {universityCount === 0
                      ? "The university database is empty. Seed the Germany Sheet2 data and try again."
                      : matches.length > 0
                        ? "No matches fit the current search or filters."
                        : "No university lists a course matching this student's desired course or specialization."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Initial State */}
        {!hasSearched && !loadError && (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <GraduationCap className="h-7 w-7" />
              </div>

              <h2 className="mt-4 text-lg font-semibold">
                {isLoading ? "Loading universities..." : "Ready to find universities?"}
              </h2>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {isLoading ? (
                  "Fetching students and university data."
                ) : (
                  <>
                    Select a student and click{" "}
                    <span className="font-medium">Find Universities</span> to match against{" "}
                    {universityCount} universities.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* More Details Dialog */}
      <Dialog
        open={Boolean(selectedMatch)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMatch(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {selectedMatch && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <GraduationCap className="h-6 w-6" />
                  </div>

                  <div>
                    <DialogTitle className="text-xl">{selectedMatch.university}</DialogTitle>

                    <DialogDescription className="mt-1">
                      {[selectedMatch.city, selectedMatch.country].filter(Boolean).join(", ")}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                {/* Basic Information */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Course Information</h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem label="University" value={selectedMatch.university} />

                    <DetailItem label="Country" value={selectedMatch.country} />

                    <DetailItem label="City" value={selectedMatch.city} />

                    <DetailItem
                      label="Matching Courses"
                      value={selectedMatch.matchedCourses.join(", ")}
                    />

                    <DetailItem label="Major Courses" value={selectedMatch.courses.join(", ")} />

                    <DetailItem
                      label={selectedMatch.rankingSource ?? "Ranking"}
                      value={selectedMatch.ranking && `#${selectedMatch.ranking}`}
                    />

                    <DetailItem
                      label="Status"
                      value={
                        <Badge variant="outline" className={statusClass(selectedMatch.status)}>
                          {selectedMatch.status}
                        </Badge>
                      }
                    />
                  </div>
                </section>

                {/* Admission Difficulty */}
                {selectedMatch.admissionDifficulty.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Admission Difficulty by Field</h3>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedMatch.admissionDifficulty.map((entry) => (
                        <div
                          key={entry.field}
                          className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${
                            selectedMatch.relevantDifficultyFields.includes(entry.field)
                              ? "border-primary/30 bg-primary/5"
                              : "border-line/60"
                          }`}
                        >
                          <span>{entry.field}</span>

                          <Badge variant="outline">{entry.level}</Badge>
                        </div>
                      ))}
                    </div>

                    {selectedMatch.relevantDifficultyFields.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Highlighted fields match the student's course.
                      </p>
                    )}
                  </section>
                )}

                {/* Financial Information */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Financial Information</h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="Annual Tuition Fee (EUR)"
                      value={selectedMatch.annualTuitionFee}
                    />

                    <DetailItem label="Student Budget" value={selectedStudent?.budget} />

                    <DetailItem
                      label="Living Budget"
                      value={formatLivingBudget(selectedMatch.livingBudget)}
                    />
                  </div>

                  {selectedMatch.livingBudget?.source && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Living budget is {selectedMatch.country}-wide, not university-specific.
                      Source: {selectedMatch.livingBudget.source}
                    </p>
                  )}
                </section>

                {/* Application */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Application Details</h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailItem
                      label="Application Opens"
                      value={
                        selectedMatch.applicationOpens && (
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                            {selectedMatch.applicationOpens}
                          </span>
                        )
                      }
                    />

                    <DetailItem
                      label="Application Deadline"
                      value={selectedMatch.applicationDeadline}
                    />

                    <DetailItem label="IELTS" value={selectedMatch.englishRequirement} />

                    <DetailItem
                      label="Recommended Indian %"
                      value={selectedMatch.recommendedIndianPercentage}
                    />
                  </div>
                </section>

                {/* Intakes */}
                {selectedMatch.intakes.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">{selectedMatch.country} Intakes</h3>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedMatch.intakes.map((intake) => (
                        <div
                          key={intake.intake}
                          className="rounded-lg border border-line/60 bg-secondary/30 p-3 text-sm"
                        >
                          <p className="font-medium">{intake.intake}</p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            Classes start: {intake.classStart || "Not available"}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Applications: {intake.applicationStart || "Not available"} –{" "}
                            {intake.applicationDeadline || "Not available"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Published Requirements */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Other Requirements</h3>

                  {selectedMatch.requirements.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedMatch.requirements.map((requirement) => (
                        <Badge key={requirement} variant="outline">
                          {requirement}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not available.</p>
                  )}
                </section>

                {/* Required Documents */}
                {selectedMatch.requiredDocuments.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">
                      {selectedMatch.country} Admission Documents
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      {selectedMatch.requiredDocuments.map((document) => (
                        <Badge key={document.document} variant="outline" title={document.purpose}>
                          {document.document}
                          {document.mandatory && document.mandatory !== "Yes"
                            ? ` (${document.mandatory})`
                            : ""}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {/* Matching Criteria */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Why this university matched</h3>

                  {selectedMatch.matchedCriteria.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedMatch.matchedCriteria.map((criteria) => (
                        <div
                          key={criteria}
                          className="flex items-center gap-2 rounded-md border border-success/20 bg-success/10 p-3 text-sm"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                          {criteria}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No specific matching criteria recorded.
                    </p>
                  )}
                </section>

                {/* Warnings */}
                {selectedMatch.warnings.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Review Before Shortlisting</h3>

                    <div className="space-y-2">
                      {selectedMatch.warnings.map((warning) => (
                        <div
                          key={warning}
                          className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm"
                        >
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />

                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Missing Requirements */}
                {selectedMatch.missingRequirements.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold">Missing Requirements</h3>

                    <div className="flex flex-wrap gap-2">
                      {selectedMatch.missingRequirements.map((requirement) => (
                        <Badge key={requirement} variant="outline">
                          {requirement}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setSelectedMatch(null)}>
                  Close
                </Button>

                {selectedMatch.action === "Shortlist" && (
                  <Button>
                    <CheckCircle2 />
                    Shortlist University
                  </Button>
                )}

                {selectedMatch.website && (
                  <Button variant="outline" asChild>
                    <a href={selectedMatch.website} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      View University
                    </a>
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
