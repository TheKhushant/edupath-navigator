import { useMemo, useState } from "react";
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
  Wallet,
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown,
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

import { mockStudents } from "@/data/mockData";
import { matchUniversities } from "@/services/universityMatcher";
import type {
  Student,
  UniversityDifficulty,
  UniversityMatch,
} from "@/types/crm";

function difficultyClass(difficulty: UniversityDifficulty) {
  switch (difficulty) {
    case "Easy":
      return "bg-success/15 text-success-foreground border-success/25";

    case "Medium":
      return "bg-info/15 text-info-foreground border-info/25";

    case "Hard":
      return "bg-warning/20 text-warning-foreground border-warning/30";

    case "Very Hard":
      return "bg-danger/15 text-danger-foreground border-danger/25";

    default:
      return "bg-secondary text-muted-foreground";
  }
}

function formatMoney(
  min: number,
  max: number,
  currency: string,
  period: string,
) {
  const formatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  });

  const amount =
    min === max
      ? `${currency} ${formatter.format(min)}`
      : `${currency} ${formatter.format(min)} – ${formatter.format(max)}`;

  return `${amount} / ${period}`;
}

function getBudgetFit(student: Student, match: UniversityMatch) {
  const budget = Number(student.budget.replace(/[^\d]/g, ""));

  if (!budget || !match.tuitionMax) {
    return {
      label: "Review",
      className: "bg-secondary text-muted-foreground border-border",
    };
  }

  if (match.tuitionMax <= budget) {
    return {
      label: "Within Budget",
      className:
        "bg-success/15 text-success-foreground border-success/25",
    };
  }

  if (match.tuitionMin <= budget) {
    return {
      label: "Near Budget",
      className:
        "bg-warning/20 text-warning-foreground border-warning/30",
    };
  }

  return {
    label: "Above Budget",
    className: "bg-danger/15 text-danger-foreground border-danger/25",
  };
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line/60 bg-secondary/30 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-foreground">
        {value || "Not available"}
      </p>
    </div>
  );
}

export function UniversityMatcher() {
  const navigate = useNavigate();

  const [selectedStudentId, setSelectedStudentId] = useState(
    mockStudents[0]?.id ?? "",
  );

  const [editableProfile, setEditableProfile] = useState({
    desiredCourse: mockStudents[0]?.desiredCourse ?? "",
    preferredCountries: mockStudents[0]?.preferredCountries.join(", ") ?? "",
    budget: mockStudents[0]?.budget ?? "",
  });

  const [isProfileEditing, setIsProfileEditing] = useState(false);

  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedMatch, setSelectedMatch] =
    useState<UniversityMatch | null>(null);

  const selectedStudent = useMemo<Student | undefined>(() => {
    const student = mockStudents.find(
      (student) => student.id === selectedStudentId,
    );

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
  }, [selectedStudentId, editableProfile]);

  const [countryFilter, setCountryFilter] = useState("All");
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [budgetFilter, setBudgetFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [intakeFilter, setIntakeFilter] = useState("All");

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  const SortableHeader = ({
    label,
    sortKey,
  }: {
    label: string;
    sortKey: string;
  }) => {
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

    return matchUniversities(selectedStudent);
  }, [selectedStudent, hasSearched]);

  const filteredMatches = useMemo(() => {
    const query = search.toLowerCase().trim();

    

    return matches.filter((match) => {
      const budgetFit = getBudgetFit(selectedStudent!, match);

      const matchesSearch =
        !query ||
        match.university.toLowerCase().includes(query) ||
        match.country.toLowerCase().includes(query) ||
        match.course.toLowerCase().includes(query) ||
        match.canonicalCourse.toLowerCase().includes(query) ||
        match.difficulty.toLowerCase().includes(query);

      const matchesCountry =
        countryFilter === "All" ||
        match.country === countryFilter;

      const matchesDifficulty =
        difficultyFilter === "All" ||
        match.difficulty === difficultyFilter;

      const matchesBudget =
        budgetFilter === "All" ||
        budgetFit.label === budgetFilter;

      const matchesStatus =
        statusFilter === "All" ||
        match.status === statusFilter;

      const matchesIntake =
        intakeFilter === "All" ||
        match.intake === intakeFilter;

      return (
        matchesSearch &&
        matchesCountry &&
        matchesDifficulty &&
        matchesBudget &&
        matchesStatus &&
        matchesIntake
      );
    });
  }, [
    matches,
    search,
    countryFilter,
    difficultyFilter,
    budgetFilter,
    statusFilter,
    intakeFilter,
    selectedStudent,
  ]);

  const handleSearch = () => {
    setHasSearched(true);
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
          valueA = a.country;
          valueB = b.country;
          break;

        case "course":
          valueA = a.course;
          valueB = b.course;
          break;

        case "tuition":
          valueA = a.tuitionMin;
          valueB = b.tuitionMin;
          break;

        case "budget":
          valueA = getBudgetFit(selectedStudent!, a).label;
          valueB = getBudgetFit(selectedStudent!, b).label;
          break;

        case "difficulty":
          valueA = a.difficulty;
          valueB = b.difficulty;
          break;

        case "intake":
          valueA = a.intake;
          valueB = b.intake;
          break;

        case "deadline":
          valueA = a.applicationDeadline;
          valueB = b.applicationDeadline;
          break;

        default:
          return 0;
      }

      const comparison = String(valueA).localeCompare(
        String(valueB),
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );

      return direction === "asc" ? comparison : -comparison;
    });
  }, [filteredMatches, sortConfig, selectedStudent]);

  

  return (
    <div className="min-h-screen bg-canvas p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/" })}
              >
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
              <CardTitle className="text-sm font-semibold">
                Student Profile
              </CardTitle>

              {isProfileEditing && (
                <span className="text-xs text-warning-foreground">
                  Unsaved changes
                </span>
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
                  onChange={(event) => {
                    const studentId = event.target.value;

                    setSelectedStudentId(studentId);

                    const student = mockStudents.find(
                      (item) => item.id === studentId,
                    );

                    if (student) {
                      setEditableProfile({
                        desiredCourse: student.desiredCourse ?? "",
                        preferredCountries:
                          student.preferredCountries.join(", "),
                        budget: student.budget ?? "",
                      });
                    }

                    setHasSearched(false);
                    setSelectedMatch(null);
                    setIsProfileEditing(false);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  {mockStudents.map((student) => (
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
                  placeholder="UK, Canada, Australia"
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
                  placeholder="e.g. ₹25 Lakh"
                  className="h-9"
                />
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
                >
                  <Search className="h-4 w-4" />
                  Find Universities
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {hasSearched && (
          <Card className="overflow-hidden shadow-none">
            <CardHeader className="border-b border-line/60">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base">
                    University Matches
                  </CardTitle>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {filteredMatches.length} universities matched
                    for {selectedStudent?.name}.
                  </p>
                </div>

                <div className="space-y-3">
                {/* Search */}
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search university, country or course..."
                    className="pl-9"
                  />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">

                  {/* Country */}
                  <select
                    value={countryFilter}
                    onChange={(event) =>
                      setCountryFilter(event.target.value)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="All">All Countries</option>

                    {[...new Set(matches.map((match) => match.country))]
                      .sort()
                      .map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                  </select>

                  {/* Difficulty */}
                  <select
                    value={difficultyFilter}
                    onChange={(event) =>
                      setDifficultyFilter(event.target.value)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="All">All Difficulty</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                    <option value="Very Hard">Very Hard</option>
                  </select>

                  {/* Budget */}
                  <select
                    value={budgetFilter}
                    onChange={(event) =>
                      setBudgetFilter(event.target.value)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="All">All Budget</option>
                    <option value="Within Budget">Within Budget</option>
                    <option value="Near Budget">Near Budget</option>
                    <option value="Above Budget">Above Budget</option>
                    <option value="Review">Review</option>
                  </select>

                  {/* Status */}
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="All">All Matches</option>
                    <option value="Matching">Matching</option>
                    <option value="Review Required">
                      Review Required
                    </option>
                  </select>

                  {/* Intake */}
                  <select
                    value={intakeFilter}
                    onChange={(event) =>
                      setIntakeFilter(event.target.value)
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="All">All Intakes</option>

                    {[...new Set(matches.map((match) => match.intake))]
                      .filter(Boolean)
                      .sort()
                      .map((intake) => (
                        <option key={intake} value={intake}>
                          {intake}
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
                      setDifficultyFilter("All");
                      setBudgetFilter("All");
                      setStatusFilter("All");
                      setIntakeFilter("All");
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
                          <SortableHeader label="Country" sortKey="country" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Course" sortKey="course" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Tuition Fee" sortKey="tuition" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Budget Fit" sortKey="budget" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Difficulty" sortKey="difficulty" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Intake" sortKey="intake" />
                        </th>

                        <th className="px-5 py-3 font-medium">
                          <SortableHeader label="Deadline" sortKey="deadline" />
                        </th>

                        <th className="px-5 py-3 text-right font-medium">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-line/60">
                      {sortedMatches.map((match) => {
                        const budgetFit = getBudgetFit(
                          selectedStudent!,
                          match,
                        );

                        return (
                          <tr
                            key={`${match.universityId}-${match.courseId}`}
                            className="transition-colors hover:bg-accent/40"
                          >
                            {/* University */}
                            <td className="px-5 py-4">
                              <div className="min-w-[200px]">
                                <p className="font-semibold">
                                  {match.university}
                                </p>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  {match.universityId}
                                </p>
                              </div>
                            </td>

                            {/* Country */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{match.country}</span>
                              </div>
                            </td>

                            {/* Course */}
                            <td className="px-5 py-4">
                              <div className="max-w-[220px]">
                                <p className="font-medium">
                                  {match.course}
                                </p>

                                {match.canonicalCourse &&
                                  match.canonicalCourse !==
                                    match.course && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {match.canonicalCourse}
                                    </p>
                                  )}
                              </div>
                            </td>

                            {/* Tuition */}
                            <td className="px-5 py-4">
                              <div className="min-w-[150px]">
                                <p className="font-medium">
                                  {formatMoney(
                                    match.tuitionMin,
                                    match.tuitionMax,
                                    match.tuitionCurrency,
                                    match.tuitionPeriod,
                                  )}
                                </p>
                              </div>
                            </td>

                            {/* Budget */}
                            <td className="px-5 py-4">
                              <Badge
                                variant="outline"
                                className={budgetFit.className}
                              >
                                {budgetFit.label}
                              </Badge>
                            </td>

                            {/* Difficulty */}
                            <td className="px-5 py-4">
                              <Badge
                                variant="outline"
                                className={difficultyClass(
                                  match.difficulty,
                                )}
                              >
                                {match.difficulty}
                              </Badge>
                            </td>

                            {/* Intake */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                {match.intake}
                              </div>
                            </td>

                            {/* Deadline */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                                {match.applicationDeadline ||
                                  "Not available"}
                              </div>
                            </td>

                            {/* Action */}
                            <td className="px-5 py-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setSelectedMatch(match)
                                }
                              >
                                More Details
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-16 text-center">
                  <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />

                  <h3 className="mt-3 font-semibold">
                    No universities found
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Try changing the student or search keyword.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Initial State */}
        {!hasSearched && (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <GraduationCap className="h-7 w-7" />
              </div>

              <h2 className="mt-4 text-lg font-semibold">
                Ready to find universities?
              </h2>

              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Select a student and click{" "}
                <span className="font-medium">
                  Find Universities
                </span>{" "}
                to generate matching university recommendations.
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
                    <DialogTitle className="text-xl">
                      {selectedMatch.university}
                    </DialogTitle>

                    <DialogDescription className="mt-1">
                      {selectedMatch.course} ·{" "}
                      {selectedMatch.country}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                {/* Basic Information */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">
                    Course Information
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="University"
                      value={selectedMatch.university}
                    />

                    <DetailItem
                      label="Country"
                      value={selectedMatch.country}
                    />

                    <DetailItem
                      label="Course"
                      value={selectedMatch.course}
                    />

                    <DetailItem
                      label="Course Category"
                      value={selectedMatch.canonicalCourse}
                    />

                    <DetailItem
                      label="Difficulty"
                      value={
                        <Badge
                          variant="outline"
                          className={difficultyClass(
                            selectedMatch.difficulty,
                          )}
                        >
                          {selectedMatch.difficulty}
                        </Badge>
                      }
                    />

                    <DetailItem
                      label="Intake"
                      value={selectedMatch.intake}
                    />
                  </div>
                </section>

                {/* Financial Information */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">
                    Financial Information
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="Tuition Fee"
                      value={formatMoney(
                        selectedMatch.tuitionMin,
                        selectedMatch.tuitionMax,
                        selectedMatch.tuitionCurrency,
                        selectedMatch.tuitionPeriod,
                      )}
                    />

                    <DetailItem
                      label="Student Budget"
                      value={selectedStudent?.budget}
                    />

                    <DetailItem
                      label="Living Cost"
                      value={formatMoney(
                        selectedMatch.livingCostMin,
                        selectedMatch.livingCostMax,
                        selectedMatch.livingCostCurrency,
                        selectedMatch.livingCostPeriod,
                      )}
                    />
                  </div>
                </section>

                {/* Application */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">
                    Application Details
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <DetailItem
                      label="Application Start"
                      value={
                        selectedMatch.applicationStartDate ||
                        "Not available"
                      }
                    />

                    <DetailItem
                      label="Application Deadline"
                      value={
                        selectedMatch.applicationDeadline ||
                        "Not available"
                      }
                    />

                    <DetailItem
                      label="Last Verified"
                      value={
                        selectedMatch.lastVerified ||
                        "Not available"
                      }
                    />
                  </div>
                </section>

                {/* Matching Criteria */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">
                    Why this university matched
                  </h3>

                  {selectedMatch.matchedCriteria.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedMatch.matchedCriteria.map(
                        (criteria) => (
                          <div
                            key={criteria}
                            className="flex items-center gap-2 rounded-md border border-success/20 bg-success/10 p-3 text-sm"
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                            {criteria}
                          </div>
                        ),
                      )}
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
                    <h3 className="mb-3 text-sm font-semibold">
                      Review Before Shortlisting
                    </h3>

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
                    <h3 className="mb-3 text-sm font-semibold">
                      Missing Requirements
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      {selectedMatch.missingRequirements.map(
                        (requirement) => (
                          <Badge
                            key={requirement}
                            variant="outline"
                          >
                            {requirement}
                          </Badge>
                        ),
                      )}
                    </div>
                  </section>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setSelectedMatch(null)}
                >
                  Close
                </Button>

                {selectedMatch.action === "Shortlist" && (
                  <Button>
                    <CheckCircle2 />
                    Shortlist University
                  </Button>
                )}

                <Button variant="outline">
                  <ExternalLink />
                  View University
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}