import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  applicationService,
  assessmentService,
  courseService,
  documentService,
  followupService,
  notificationService,
  paymentService,
  searchTagService,
  studentService,
  universityCourseService,
  universityService,
  visaService,
} from "@/services/crmServices";
import { useDashboard, useNotifications, useStudents } from "@/hooks/useCrm";
import { apiConfig } from "@/lib/api";
import { UniversityImport } from "@/components/crm/UniversityImport";
import { UniversityExplorer } from "@/components/crm/UniversityExplorer";
import {
  CourseDialog,
  MatchReason,
  SearchExpansionPanel,
  SearchTagManager,
  type CourseDialogState,
} from "@/components/crm/CourseSearch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Compass,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Users,
  X,
} from "lucide-react";

import { pipelineDefinitions } from "@/data/pipelineData";
import type {
  Application,
  AssessmentResult,
  Course,
  DocumentRecord,
  FollowUp,
  Payment,
  SearchPage,
  ServiceType,
  Student,
  University,
  UniversityCourse,
  VisaCase,
} from "@/types/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ModuleKey =
  | "dashboard"
  | "students"
  | "universities"
  | "courses"
  | "explorer"
  | "applications"
  | "documents"
  | "visa"
  | "payments"
  | "follow-ups"
  | "pipelines"
  | "assessment"
  | "reports"
  | "settings";
type IconComponent = typeof LayoutDashboard;

const navigation: { label: string; to: string; key: ModuleKey; icon: IconComponent }[] = [
  { label: "Overview", to: "/", key: "dashboard", icon: LayoutDashboard },
  { label: "Students", to: "/students", key: "students", icon: Users },
  { label: "Universities", to: "/universities", key: "universities", icon: GraduationCap },
  { label: "Courses", to: "/courses", key: "courses", icon: BookOpen },
  { label: "Explorer", to: "/explorer", key: "explorer", icon: Compass },
  { label: "Applications", to: "/applications", key: "applications", icon: ClipboardList },
  { label: "Documents", to: "/documents", key: "documents", icon: FileCheck2 },
  { label: "Visa cases", to: "/visa", key: "visa", icon: BriefcaseBusiness },
  { label: "Payments", to: "/payments", key: "payments", icon: CircleDollarSign },
  { label: "Follow-ups", to: "/follow-ups", key: "follow-ups", icon: CalendarClock },
  { label: "Pipelines", to: "/pipelines", key: "pipelines", icon: GitBranch },
  { label: "Assessment", to: "/assessment", key: "assessment", icon: ClipboardCheck },
  { label: "Reports", to: "/reports", key: "reports", icon: BarChart3 },
];

// Mobile bottom bar keeps its original five modules
const compactNavigation = navigation.filter((item) => item.key !== "explorer").slice(0, 5);
function statusTone(status: string) {
  if (["Approved", "Paid", "Completed", "Offer Received", "Ready", "Uploaded"].includes(status))
    return "bg-success/15 text-success-foreground border-success/25";
  if (["Rejected", "Overdue", "Documents Pending"].includes(status))
    return "bg-danger/15 text-danger-foreground border-danger/25";
  if (
    [
      "Pending",
      "Under Review",
      "Partial",
      "Draft",
      "Ready to Submit",
      "Appointment Scheduled",
    ].includes(status)
  )
    return "bg-warning/20 text-warning-foreground border-warning/30";
  return "bg-info/15 text-info-foreground border-info/25";
}

function StatusBadge({ children }: { children: string }) {
  return (
    <Badge variant="outline" className={`font-medium ${statusTone(children)}`}>
      {children}
    </Badge>
  );
}

function AppLogo() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function Sidebar({
  active,
  mobileOpen,
  onClose,
}: {
  active: ModuleKey;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-ink/20 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line/60 bg-card/90 px-4 py-5 backdrop-blur-xl transition-transform md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center gap-3 px-2">
          <AppLogo />
          <div>
            <p className="text-sm font-semibold tracking-tight text-foreground">SS Overseas</p>
            <p className="text-[11px] text-muted-foreground">Operations workspace</p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="mt-8 flex-1 space-y-1 overflow-y-auto">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          {navigation.map(({ label, to, key, icon: Icon }) => (
            <Link
              key={key}
              to={to}
              onClick={onClose}
              activeOptions={{ exact: key === "dashboard" }}
              activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
              inactiveProps={{
                className: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              }}
              className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
              {["documents", "follow-ups"].includes(key) && (
                <span className="ml-auto rounded-full bg-warning/20 px-1.5 text-[10px] text-warning-foreground">
                  {key === "documents" ? "12" : "9"}
                </span>
              )}
            </Link>
          ))}
        </div>
        <div className="border-t border-line/60 pt-4">
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-secondary/70 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
              MR
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">Manisha Rao</p>
              <p className="truncate text-[11px] text-muted-foreground">Senior counsellor</p>
            </div>
            <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </aside>
    </>
  );
}

function PageHeader({
  title,
  description,
  action,
  onAction,
  extraActions,
}: {
  title: string;
  description: string;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
  extraActions?: React.ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          SS Overseas CRM
        </p>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/university-matcher" })}>
          <GraduationCap />
          University Matcher
        </Button>

        {extraActions}

        {action && onAction && (
          <Button onClick={onAction}>
            <Plus />
            {action}
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <FileText className="h-5 w-5" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function LoadingState({ label = "Loading records..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-danger/15 text-danger-foreground">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="font-semibold">Unable to load data</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const formatAmount = (amount: number, currency = "INR") =>
  currency === "INR"
    ? `₹${amount.toLocaleString("en-IN")}`
    : `${currency} ${amount.toLocaleString("en-IN")}`;

function Dashboard({ onNavigate }: { onNavigate: (module: ModuleKey) => void }) {
  const statIcons = [
    Users,
    ClipboardCheck,
    FileCheck2,
    AlertCircle,
    GraduationCap,
    BriefcaseBusiness,
    CircleDollarSign,
    CalendarClock,
  ];
  const { data: dashboard, loading, error, reload } = useDashboard();

  return (
    <div className="workspace-rise">
      <PageHeader
        title="Good morning, Manisha"
        description="A clear view of today’s student journeys and actions."
        action="Add student"
        onAction={() => onNavigate("students")}
      />
      {!dashboard ? (
        <Card className="workspace-glass shadow-none">
          {error ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : (
            <LoadingState label={loading ? "Loading dashboard..." : "No dashboard data"} />
          )}
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {dashboard.stats.map((stat, index) => {
              const Icon = statIcons[index] ?? BarChart3;
              return (
                <Card key={stat.label} className="workspace-glass shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="rounded-md bg-secondary p-2 text-brand">
                        <Icon className="h-4 w-4" />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-2xl font-semibold tracking-tight">{stat.value}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{stat.detail}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <Card className="workspace-glass shadow-none">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Application pipeline</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Students moving through the journey
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onNavigate("applications")}>
                  View applications <ChevronRight />
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {dashboard.pipeline.map((stage, index) => (
                    <div key={stage.label}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-medium">{stage.label}</span>
                        <span className="text-muted-foreground">{stage.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${stage.state === "active" ? "bg-primary" : stage.state === "complete" ? "bg-success" : "bg-info/50"}`}
                          style={{ width: `${Math.max(18, 100 - index * 13)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="workspace-glass shadow-none">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Upcoming deadlines</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The next actions needing attention
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onNavigate("applications")}>
                  <ArrowUpRight />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.deadlines.map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-3 rounded-lg border border-line/60 bg-background/50 p-3"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md ${item.tone === "danger" ? "bg-danger/15 text-danger-foreground" : item.tone === "warning" ? "bg-warning/20 text-warning-foreground" : "bg-info/15 text-info-foreground"}`}
                    >
                      <span className="text-base font-semibold leading-none">{item.date}</span>
                      <span className="mt-1 text-[9px] font-semibold">{item.month}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                ))}
                {dashboard.deadlines.length === 0 && (
                  <p className="text-sm text-muted-foreground">No upcoming dated deadlines.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <Card className="workspace-glass shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.activities.map((activity) => (
                  <div key={activity.title} className="flex gap-3">
                    <div
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${activity.tone === "success" ? "bg-success" : activity.tone === "warning" ? "bg-warning" : "bg-brand"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{activity.detail}</p>
                    </div>
                  </div>
                ))}
                {dashboard.activities.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No recent application or payment activity.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="workspace-glass shadow-none">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Destination mix</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => onNavigate("reports")}>
                  Reports <ChevronRight />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.countryMix.map((item) => (
                  <div key={item.country}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{item.country}</span>
                      <span className="font-medium">{item.count} students</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: item.width }}
                      />
                    </div>
                  </div>
                ))}
                {dashboard.countryMix.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No preferred countries recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function TableToolbar({
  search,
  setSearch,
  filter,
  setFilter,
  filterOptions,
  placeholder = "Search records...",
}: {
  search: string;
  setSearch: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  filterOptions: string[];
  placeholder?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={placeholder}
          className="pl-9 bg-background/60"
        />
      </div>
      {filterOptions.length > 0 && (
        <div className="relative sm:w-48">
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-9 w-full appearance-none rounded-md border border-input bg-background/60 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="All">All statuses</option>
            {filterOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function StudentsModule() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const deleteStudent = async () => {
    if (!selected) return;

    const confirmed = window.confirm(`Are you sure you want to delete ${selected.name}?`);

    if (!confirmed) return;

    try {
      await studentService.deleteStudent(selected.id);

      setStudents((current) => current.filter((student) => student.id !== selected.id));

      setSelected(null);
      setEditing(false);

      console.log("Student deleted from MongoDB:", selected.id);
    } catch (error) {
      console.error("Failed to delete student:", error);
      alert("Failed to delete student");
    }
  };

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const data = await studentService.getStudents();
        setStudents(data);
      } catch (error) {
        console.error("Failed to load students:", error);
      }
    };

    loadStudents();
  }, []);

  const filtered = useMemo(
    () =>
      students.filter(
        (student) =>
          `${student.name} ${student.email} ${student.city}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (filter === "All" || student.stage === filter),
      ),
    [students, search, filter],
  );
  const addStudent = async () => {
    if (!name.trim()) return;

    const initials = name
      .trim()
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const newStudent: Student = {
      // Next number after the highest existing SS-2026 id (count-based ids collide after deletes)
      id: `SS-2026-${String(
        Math.max(
          0,
          ...students.map((student) => Number(student.id.match(/^SS-2026-(\d+)$/)?.[1] ?? 0)),
        ) + 1,
      ).padStart(4, "0")}`,
      name: name.trim(),
      initials,
      email: email.trim() || "new.student@example.com",
      mobile: "Not provided",
      qualification: "To be assessed",
      branch: "To be assessed",
      cgpa: "—",
      graduationYear: 2026,
      desiredCourse: "To be discussed",
      specialization: "—",
      preferredCountries: [],
      intake: "To be confirmed",
      budget: "—",
      counsellor: "Manisha",
      stage: "New Enquiry",
      lastFollowUp: "Today",
      status: "Active",
      service: "Study Abroad",
      city: "—",
    };

    try {
      const createdStudent = await studentService.createStudent(newStudent);

      setStudents((current) => [createdStudent, ...current]);
      setSelected(createdStudent);

      setAdding(false);
      setName("");
      setEmail("");

      console.log("Student saved to MongoDB:", createdStudent);
    } catch (error) {
      console.error("Failed to create student:", error);
      alert("Failed to save student");
    }
  };

  const saveStudent = async () => {
    if (!selected) return;

    try {
      const updatedStudent = await studentService.updateStudent(selected.id, editForm);

      setStudents((current) =>
        current.map((student) => (student.id === updatedStudent.id ? updatedStudent : student)),
      );

      setSelected(updatedStudent);
      setEditing(false);

      console.log("Student updated in MongoDB:", updatedStudent);
    } catch (error) {
      console.error("Failed to update student:", error);
      alert("Failed to update student");
    }
  };

  return (
    <div className="workspace-rise">
      <PageHeader
        title="Students"
        description={`${students.length} active student records across all journeys.`}
        action="Add student"
        onAction={() => setAdding(true)}
      />
      <TableToolbar
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        filterOptions={[
          "New Enquiry",
          "Registration",
          "Profile Assessment",
          "University Shortlist",
          "Documents",
          "Application",
          "Visa",
        ]}
      />
      <Card className="overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Journey stage</th>
                <th className="px-5 py-3 font-medium">Counsellor</th>
                <th className="px-5 py-3 font-medium">Last follow-up</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filtered.map((student) => (
                <tr key={student.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-5 py-3">
                    <button
                      className="flex items-center gap-3 text-left"
                      onClick={() => {
                        setSelected(student);
                        setEditForm({ ...student });
                        setEditing(false);
                      }}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                        {student.initials}
                      </span>
                      <span>
                        <span className="block font-medium">{student.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {student.id} · {student.city}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{student.service}</td>
                  <td className="px-5 py-3">
                    <StatusBadge>{student.stage}</StatusBadge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{student.counsellor}</td>
                  <td className="px-5 py-3 text-muted-foreground">{student.lastFollowUp}</td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelected(student);
                        setEditForm({ ...student });
                        setEditing(false);
                      }}
                    >
                      View <ChevronRight />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              title="No students found"
              description="Try a different search or status filter."
            />
          )}
        </div>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setEditing(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit student" : selected?.name}</DialogTitle>

            <DialogDescription>
              {selected?.id} · {selected?.service} · {selected?.city}
            </DialogDescription>
          </DialogHeader>

          {selected && !editing && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Name", selected.name],
                  ["Email", selected.email],
                  ["Mobile", selected.mobile],
                  ["Qualification", selected.qualification],
                  ["Branch", selected.branch],
                  ["CGPA", selected.cgpa],
                  ["Graduation Year", selected.graduationYear],
                  ["Desired Course", selected.desiredCourse],
                  ["Specialization", selected.specialization],
                  ["Countries", selected.preferredCountries.join(", ") || "To be discussed"],
                  ["Intake", selected.intake],
                  ["Budget", selected.budget],
                  ["Counsellor", selected.counsellor],
                  ["Stage", selected.stage],
                  ["Status", selected.status],
                  ["Service", selected.service],
                  ["City", selected.city],
                  ["Last Follow-up", selected.lastFollowUp],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-line/60 bg-secondary/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>

                    <p className="mt-1 text-sm font-medium">{String(value ?? "—")}</p>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>

                <Button
                  onClick={() => {
                    setEditForm({ ...selected });
                    setEditing(true);
                  }}
                >
                  Edit student
                </Button>
                <DialogFooter>
                  <Button variant="destructive" onClick={deleteStudent}>
                    Delete Student
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>

                  <Button onClick={saveStudent}>Save changes</Button>
                </DialogFooter>
              </DialogFooter>
            </>
          )}

          {selected && editing && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Name */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                    value={editForm.name ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Email */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Email
                  <Input
                    type="email"
                    value={editForm.email ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        email: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Mobile */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Mobile
                  <Input
                    value={editForm.mobile ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        mobile: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Qualification */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Qualification
                  <Input
                    value={editForm.qualification ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        qualification: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Branch */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Branch
                  <Input
                    value={editForm.branch ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        branch: event.target.value,
                      })
                    }
                  />
                </label>

                {/* CGPA */}
                <label className="grid gap-1.5 text-sm font-medium">
                  CGPA
                  <Input
                    value={editForm.cgpa ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        cgpa: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Graduation Year */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Graduation Year
                  <Input
                    type="number"
                    value={editForm.graduationYear ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        graduationYear: Number(event.target.value),
                      })
                    }
                  />
                </label>

                {/* Desired Course */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Desired Course
                  <Input
                    value={editForm.desiredCourse ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        desiredCourse: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Specialization */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Specialization
                  <Input
                    value={editForm.specialization ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        specialization: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Intake */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Intake
                  <Input
                    value={editForm.intake ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        intake: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Budget */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Budget
                  <Input
                    value={editForm.budget ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        budget: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Counsellor */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Counsellor
                  <Input
                    value={editForm.counsellor ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        counsellor: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Stage */}
                {/* Stage */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Stage
                  <select
                    value={editForm.stage ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        stage: event.target.value as Student["stage"],
                      })
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="New Enquiry">New Enquiry</option>
                    <option value="Registration">Registration</option>
                    <option value="Profile Assessment">Profile Assessment</option>
                    <option value="University Shortlist">University Shortlist</option>
                    <option value="Documents">Documents</option>
                    <option value="Application">Application</option>
                    <option value="Visa">Visa</option>
                  </select>
                </label>

                {/* Status */}
                {/* Status */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Status
                  <select
                    value={editForm.status ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        status: event.target.value as Student["status"],
                      })
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>

                {/* Service */}
                {/* Service */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Service
                  <Input
                    value={editForm.service ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        service: event.target.value as Student["service"],
                      })
                    }
                  />
                </label>

                {/* City */}
                <label className="grid gap-1.5 text-sm font-medium">
                  City
                  <Input
                    value={editForm.city ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        city: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Last Follow-up */}
                <label className="grid gap-1.5 text-sm font-medium">
                  Last Follow-up
                  <Input
                    value={editForm.lastFollowUp ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        lastFollowUp: event.target.value,
                      })
                    }
                  />
                </label>

                {/* Preferred Countries */}
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Preferred Countries
                  <Input
                    value={editForm.preferredCountries?.join(", ") ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        preferredCountries: event.target.value
                          .split(",")
                          .map((country) => country.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Germany, Japan, Netherlands"
                  />
                </label>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setEditForm({ ...selected });
                  }}
                >
                  Cancel
                </Button>

                <Button onClick={saveStudent}>Save changes</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add student</DialogTitle>
            <DialogDescription>
              Start a new student record for the counselling team.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">
              Full name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Neha Kapoor"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="student@example.com"
                type="email"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={addStudent} disabled={!name.trim()}>
              Create student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelinesModule() {
  const services = Object.keys(pipelineDefinitions) as ServiceType[];
  const [service, setService] = useState<ServiceType>(services[0] ?? "Study Abroad");
  const definition = pipelineDefinitions[service];
  const { data: students, loading, error, reload } = useStudents();
  const serviceStudents = (students ?? []).filter((student) => student.service === service);

  return (
    <div className="workspace-rise">
      <PageHeader
        title="Service pipelines"
        description="See every student journey by service and current stage."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {services.map((item) => (
          <Button
            key={item}
            variant={service === item ? "default" : "outline"}
            size="sm"
            onClick={() => setService(item)}
          >
            {pipelineDefinitions[item].label}
          </Button>
        ))}
      </div>
      {error ? (
        <Card className="shadow-none">
          <ErrorState message={error.message} onRetry={reload} />
        </Card>
      ) : loading ? (
        <Card className="shadow-none">
          <LoadingState label="Loading students..." />
        </Card>
      ) : (
        <div className="overflow-x-auto pb-3">
          <div className="flex min-w-[980px] gap-3">
            {definition.stages.map((stage, index) => {
              const cards = serviceStudents.filter(
                (student) =>
                  student.stage === stage ||
                  (index === 0 && !definition.stages.includes(student.stage)),
              );
              return (
                <div
                  key={stage}
                  className="w-48 shrink-0 rounded-lg border border-line/60 bg-secondary/35 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{stage}</p>
                    <span className="text-[11px] text-muted-foreground">{cards.length}</span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((student) => (
                      <div
                        key={student.id}
                        className="rounded-md border border-line/60 bg-card p-3 shadow-sm"
                      >
                        <p className="text-sm font-medium">{student.name}</p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                          {student.desiredCourse} · {student.city}
                        </p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {student.counsellor}
                        </p>
                      </div>
                    ))}
                    {cards.length === 0 && (
                      <p className="py-4 text-center text-[11px] text-muted-foreground">
                        No students
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   COURSES
   Server-side ranked search (related search tags), filters
   and pagination for the course catalogue and the imported
   university programmes.
========================================================= */

const COURSE_PAGE_SIZE = 25;

type CourseView = "catalogue" | "programmes";

type CourseResults =
  | { view: "catalogue"; result: SearchPage<Course> }
  | { view: "programmes"; result: SearchPage<UniversityCourse> };

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

const EDITABLE_COURSE_FIELDS = [
  "name",
  "degree",
  "specialization",
  "country",
  "field",
  "duration",
  "language",
  "status",
  "requirements",
  "notes",
  "customSearchTags",
] as const;

const EDITABLE_PROGRAMME_FIELDS = [
  "courseName",
  "degree",
  "specialization",
  "subjectArea",
  "language",
  "duration",
  "studyMode",
  "intake",
  "applicationDeadline",
  "applicationMethod",
  "ielts",
  "tuitionMin",
  "tuitionMax",
  "tuitionCurrency",
  "city",
  "programmeUrl",
  "eligibility",
  "customSearchTags",
] as const;

function CoursesModule() {
  const [view, setView] = useState<CourseView>("catalogue");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [results, setResults] = useState<CourseResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<CourseDialogState | null>(null);
  const [managingTags, setManagingTags] = useState(false);
  const [tagNames, setTagNames] = useState<Map<string, string>>(new Map());
  const [universityOptions, setUniversityOptions] = useState<{ id: string; name: string }[]>([]);

  const query = useDebouncedValue(search.trim());

  useEffect(() => {
    let cancelled = false;
    const params = { q: query, status: filter, page, limit: COURSE_PAGE_SIZE };

    setLoading(true);
    setError(null);

    const request: Promise<CourseResults> =
      view === "catalogue"
        ? courseService.searchCourses(params).then((result) => ({ view, result }))
        : universityCourseService
            .searchUniversityCourses(params)
            .then((result) => ({ view: "programmes" as const, result }));

    request
      .then((next) => {
        if (!cancelled) setResults(next);
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error("Failed to load courses:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Unable to load courses");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, query, filter, page, reloadKey]);

  const loadTagNames = async () => {
    if (tagNames.size || apiConfig.useMockData) return;
    try {
      const tags = await searchTagService.getSearchTags();
      setTagNames(new Map(tags.map((tag) => [tag.key, tag.name])));
    } catch (tagError) {
      console.error("Failed to load search tags:", tagError);
    }
  };

  const openDialog = (state: CourseDialogState) => {
    loadTagNames();
    if (state.kind === "programme") loadUniversityOptions();
    setDialog(state);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const changeView = (value: string) => {
    setView(value as CourseView);
    setFilter("All");
    setPage(1);
    setResults(null);
  };

  const saveCourse = async (course: Partial<Course>, isNew: boolean) => {
    const payload: Partial<Course> = Object.fromEntries(
      EDITABLE_COURSE_FIELDS.filter((field) => course[field] !== undefined).map((field) => [
        field,
        course[field],
      ]),
    );

    if (isNew) await courseService.createCourse({ ...payload, id: `CRS-${Date.now()}` });
    else if (course.id) await courseService.updateCourse(course.id, payload);

    setReloadKey((key) => key + 1);
  };

  const saveProgramme = async (course: Partial<UniversityCourse>, isNew: boolean) => {
    const payload: Partial<UniversityCourse> & { universityExternalId?: string } =
      Object.fromEntries(
        EDITABLE_PROGRAMME_FIELDS.filter((field) => course[field] !== undefined).map((field) => [
          field,
          typeof course[field] === "string" ? (course[field] as string).trim() : course[field],
        ]),
      );
    // The server resolves the readable university id to the reference + name
    if (course.universityId) payload.universityExternalId = course.universityId;

    if (isNew) {
      await universityCourseService.createUniversityCourse({ ...payload, id: `UC-${Date.now()}` });
    } else if (course.id) {
      await universityCourseService.updateUniversityCourse(course.id, payload);
    }

    setReloadKey((key) => key + 1);
  };

  const loadUniversityOptions = async () => {
    if (universityOptions.length) return;
    try {
      const universities = await universityService.getUniversities();
      setUniversityOptions(
        universities
          .map((university) => ({ id: university.id, name: university.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (loadError) {
      console.error("Failed to load universities:", loadError);
    }
  };

  const result = results?.result;
  const searchInfo = result?.search ?? null;
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE));
  const firstRow = total ? (page - 1) * COURSE_PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(page * COURSE_PAGE_SIZE, total);

  const rows =
    results?.view === "catalogue"
      ? results.result.data.map((item) => (
          <tr
            key={item.id}
            className="cursor-pointer hover:bg-accent/40"
            onClick={() => openDialog({ kind: "course", course: item, isNew: false })}
          >
            <td className="px-5 py-3">
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {[item.degree, item.duration].filter(Boolean).join(" · ")}
              </p>
              {searchInfo && item.searchMatch && <MatchReason match={item.searchMatch} />}
            </td>
            <td className="px-5 py-3">{item.country}</td>
            <td className="px-5 py-3 text-muted-foreground">{item.specialization}</td>
            <td className="px-5 py-3 text-muted-foreground">{item.language}</td>
            <td className="px-5 py-3">{item.status && <StatusBadge>{item.status}</StatusBadge>}</td>
          </tr>
        ))
      : results?.view === "programmes"
        ? results.result.data.map((item) => (
            <tr
              key={item.id}
              className="cursor-pointer hover:bg-accent/40"
              onClick={() => openDialog({ kind: "programme", course: item, isNew: false })}
            >
              <td className="px-5 py-3">
                <p className="font-medium">{item.courseName}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.specialization, item.duration].filter(Boolean).join(" · ") || item.id}
                </p>
                {searchInfo && item.searchMatch && <MatchReason match={item.searchMatch} />}
              </td>
              <td className="px-5 py-3">{item.universityName || "Not linked"}</td>
              <td className="px-5 py-3 text-muted-foreground">{item.degree || "—"}</td>
              <td className="px-5 py-3 text-muted-foreground">{item.language || "—"}</td>
              <td className="px-5 py-3 text-muted-foreground">{item.city || "—"}</td>
            </tr>
          ))
        : [];

  const headers =
    view === "catalogue"
      ? ["Course", "Country", "Specialization", "Language", "Status"]
      : ["Programme", "University", "Degree", "Language", "City"];

  return (
    <div className="workspace-rise">
      <PageHeader
        title="Courses"
        description="Manage the pathways your counsellors recommend."
        action={view === "catalogue" ? "Add course" : "Add programme"}
        onAction={() =>
          view === "catalogue"
            ? openDialog({
                kind: "course",
                course: { status: "Active", customSearchTags: [] },
                isNew: true,
              })
            : openDialog({ kind: "programme", course: { customSearchTags: [] }, isNew: true })
        }
        extraActions={
          apiConfig.useMockData ? undefined : (
            <Button variant="outline" onClick={() => setManagingTags(true)}>
              <Tags />
              Search tags
            </Button>
          )
        }
      />

      <Tabs value={view} onValueChange={changeView} className="mb-4">
        <TabsList>
          <TabsTrigger value="catalogue">Course catalogue</TabsTrigger>
          <TabsTrigger value="programmes">University programmes</TabsTrigger>
        </TabsList>
      </Tabs>

      <TableToolbar
        search={search}
        setSearch={changeSearch}
        filter={filter}
        setFilter={(value) => {
          setFilter(value);
          setPage(1);
        }}
        filterOptions={view === "catalogue" ? ["Active", "Draft"] : []}
        placeholder={
          view === "catalogue"
            ? "Search courses, specializations or tags (e.g. AI)..."
            : "Search programmes, universities or tags (e.g. AI)..."
        }
      />

      {searchInfo && !error && (
        <SearchExpansionPanel search={searchInfo} total={total} onSearch={changeSearch} />
      )}

      <Card className="overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="px-5 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y divide-line/60 ${loading ? "opacity-60" : ""}`}>
              {rows}
            </tbody>
          </table>
          {error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : loading && !rows.length ? (
            <LoadingState />
          ) : (
            !loading &&
            rows.length === 0 &&
            (query || filter !== "All" ? (
              <EmptyState
                title="No matching records"
                description="Try changing the search or status filter."
              />
            ) : (
              <EmptyState
                title="No records yet"
                description="There are no records for this module in the database yet."
              />
            ))
          )}
        </div>
        {total > COURSE_PAGE_SIZE && (
          <div className="flex flex-col items-center justify-between gap-2 border-t border-line/60 px-5 py-3 text-xs text-muted-foreground sm:flex-row">
            <span>
              Showing {firstRow}–{lastRow} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount || loading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <CourseDialog
        state={dialog}
        tagNames={tagNames}
        onClose={() => setDialog(null)}
        onSaveCourse={saveCourse}
        universities={universityOptions}
        onSaveProgramme={saveProgramme}
      />

      {!apiConfig.useMockData && (
        <SearchTagManager
          open={managingTags}
          onOpenChange={setManagingTags}
          scope={view === "catalogue" ? "courses" : "university-courses"}
          onChanged={() => {
            setTagNames(new Map());
            setReloadKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

type RecordLists = {
  applications: Application[];
  documents: DocumentRecord[];
  visa: VisaCase[];
  payments: Payment[];
  "follow-ups": FollowUp[];
};

type RecordKey = keyof RecordLists;

const RECORD_KEYS: RecordKey[] = ["applications", "documents", "visa", "payments", "follow-ups"];

const isRecordKey = (module: string): module is RecordKey =>
  RECORD_KEYS.some((key) => key === module);

const emptyRecords: RecordLists = {
  applications: [],
  documents: [],
  visa: [],
  payments: [],
  "follow-ups": [],
};

function RecordsModule({
  module,
}: {
  module: Exclude<
    ModuleKey,
    "dashboard" | "students" | "courses" | "explorer" | "pipelines" | "settings"
  >;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null);

  const [editingUniversity, setEditingUniversity] = useState(false);

  const [addingUniversity, setAddingUniversity] = useState(false);

  const [universityForm, setUniversityForm] = useState<Partial<University>>({});

  const [records, setRecords] = useState<RecordLists>(emptyRecords);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const loadRecords = async (key: RecordKey) => {
    setRecordsLoading(true);
    setRecordsError(null);

    try {
      switch (key) {
        case "applications": {
          const data = await applicationService.getApplications();
          setRecords((current) => ({ ...current, applications: data }));
          break;
        }
        case "documents": {
          const data = await documentService.getDocuments();
          setRecords((current) => ({ ...current, documents: data }));
          break;
        }
        case "visa": {
          const data = await visaService.getVisaCases();
          setRecords((current) => ({ ...current, visa: data }));
          break;
        }
        case "payments": {
          const data = await paymentService.getPayments();
          setRecords((current) => ({ ...current, payments: data }));
          break;
        }
        case "follow-ups": {
          const data = await followupService.getFollowUps();
          setRecords((current) => ({ ...current, "follow-ups": data }));
          break;
        }
      }
    } catch (error) {
      console.error(`Failed to load ${key}:`, error);
      setRecordsError(error instanceof Error ? error.message : "Unable to load records");
    } finally {
      setRecordsLoading(false);
    }
  };

  const openAddUniversity = () => {
    setUniversityForm({
      id: `UNI-${Date.now()}`,
      name: "",
      country: "Germany",
      city: "",
      ranking: "",
      difficulty: "Medium",
      website: "",
      applicationFee: "",
      scholarship: "",
      tuitionFeeMin: 0,
      tuitionFeeMax: 0,
      applicationOpens: "",
      applicationDeadline: "",
      englishRequirement: "",
      popularCourses: [],
      requirements: [],
      recommendedIndianPercentage: "",
      status: "Active",
    });

    setAddingUniversity(true);
  };

  const openEditUniversity = (university: University) => {
    setSelectedUniversity(university);

    setUniversityForm({
      ...university,
    });

    setEditingUniversity(true);
  };

  const openUniversity = (university: University) => {
    setSelectedUniversity(university);
    setEditingUniversity(false);
  };

  const deleteUniversity = async (university: University) => {
    const confirmed = window.confirm(`Are you sure you want to delete ${university.name}?`);

    if (!confirmed) return;

    try {
      await universityService.deleteUniversity(university.id);

      setUniversities((current) => current.filter((item) => item.id !== university.id));

      setSelectedUniversity(null);
      setEditingUniversity(false);

      alert("University deleted successfully");
    } catch (error) {
      console.error("Failed to delete university:", error);
      alert("Failed to delete university");
    }
  };

  const saveUniversity = async () => {
    try {
      if (!universityForm.name?.trim()) {
        alert("University name is required");
        return;
      }

      console.log("University payload:", universityForm);

      if (addingUniversity) {
        const newUniversity = await universityService.createUniversity(
          universityForm as University,
        );

        setUniversities((current) => [newUniversity, ...current]);

        setAddingUniversity(false);

        alert("University added successfully");

        return;
      }

      if (editingUniversity && selectedUniversity) {
        const updatedUniversity = await universityService.updateUniversity(
          selectedUniversity.id,
          universityForm,
        );

        setUniversities((current) =>
          current.map((university) =>
            university.id === selectedUniversity.id ? updatedUniversity : university,
          ),
        );

        setSelectedUniversity(updatedUniversity);
        setEditingUniversity(false);

        alert("University updated successfully");
      }
    } catch (error) {
      console.error("Failed to save university:", error);

      alert(error instanceof Error ? error.message : "Failed to save university");
    }
  };

  const config = {
    universities: {
      title: "Universities",
      description: "Compare verified institutions and programme requirements.",
      action: "Add university",
      filters: [...new Set(universities.map((item) => item.country))],
    },
    applications: {
      title: "Applications",
      description: "Track submissions, deadlines, offers, and next actions.",
      action: "Add application",
      filters: [
        "Draft",
        "Documents Pending",
        "Ready to Submit",
        "Submitted",
        "Under Review",
        "Offer Received",
      ],
    },
    documents: {
      title: "Documents",
      description: "Keep every student file moving toward approval.",
      action: "Upload document",
      filters: ["Pending", "Uploaded", "Under Review", "Approved", "Rejected"],
    },
    visa: {
      title: "Visa cases",
      description: "Monitor readiness, appointments, and submission progress.",
      action: "Add visa case",
      filters: [
        "Not Started",
        "Documents Pending",
        "Ready",
        "Appointment Scheduled",
        "Under Review",
      ],
    },
    payments: {
      title: "Payments",
      description: "Stay ahead of balances, due dates, and receipts.",
      action: "Record payment",
      filters: ["Paid", "Partial", "Pending", "Overdue"],
    },
    "follow-ups": {
      title: "Follow-ups",
      description: "Prioritise the conversations that keep journeys moving.",
      action: "Schedule follow-up",
      filters: ["Pending", "Completed", "Overdue"],
    },
    assessment: {
      title: "Assessment",
      description: "Review profile readiness and matching recommendations.",
      action: undefined,
      filters: [],
    },
    reports: {
      title: "Reports",
      description: "A focused view of destinations, workload, and conversion signals.",
      action: undefined,
      filters: [],
    },
  }[module];

  const loadUniversities = async () => {
    setRecordsLoading(true);
    setRecordsError(null);

    try {
      const data = await universityService.getUniversities();
      setUniversities(data);
    } catch (error) {
      console.error("Failed to load universities:", error);
      setRecordsError(error instanceof Error ? error.message : "Unable to load universities");
    } finally {
      setRecordsLoading(false);
    }
  };

  const reloadCurrent = () => {
    if (module === "universities") loadUniversities();
    else if (isRecordKey(module)) loadRecords(module);
  };

  useEffect(() => {
    reloadCurrent();
  }, [module]);

  const query = search.toLowerCase();
  if (module === "assessment") return <AssessmentModule />;
  if (module === "reports") return <ReportsModule />;
  const rows =
    module === "universities"
      ? universities
          .filter(
            (item) =>
              `${item.name} ${item.country} ${item.city}`.toLowerCase().includes(query) &&
              (filter === "All" || item.country === filter),
          )
          .map((item) => (
            <tr key={item.id} className="hover:bg-accent/40">
              <td className="px-5 py-3">
                <p className="font-medium">{item.name}</p>

                <p className="text-xs text-muted-foreground">
                  {item.id} · {item.city}
                </p>
              </td>

              <td className="px-5 py-3 text-muted-foreground">{item.country}</td>

              <td className="px-5 py-3">
                <div>
                  <p className="font-medium">
                    {item.popularCourses?.length ? item.popularCourses.join(", ") : "No courses"}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {item.website || "Website not available"}
                  </p>
                </div>
              </td>

              <td className="px-5 py-3 text-muted-foreground">{item.ranking || "Not ranked"}</td>

              <td className="px-5 py-3">
                <StatusBadge>{item.difficulty || "Not specified"}</StatusBadge>
              </td>

              <td className="px-5 py-3 text-right">
                <Button variant="ghost" size="sm" onClick={() => openUniversity(item)}>
                  View <ChevronRight />
                </Button>
              </td>
            </tr>
          ))
      : module === "applications"
        ? records.applications
            .filter(
              (item) =>
                `${item.student} ${item.university} ${item.course}`.toLowerCase().includes(query) &&
                (filter === "All" || item.status === filter),
            )
            .map((item) => (
              <tr key={item.id} className="hover:bg-accent/40">
                <td className="px-5 py-3">
                  <p className="font-medium">{item.student}</p>
                  <p className="text-xs text-muted-foreground">{item.university}</p>
                </td>
                <td className="px-5 py-3">{item.course}</td>
                <td className="px-5 py-3">
                  <StatusBadge>{item.status}</StatusBadge>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{item.deadline}</td>
                <td className="px-5 py-3 text-muted-foreground">{item.counsellor}</td>
              </tr>
            ))
        : module === "documents"
          ? records.documents
              .filter(
                (item) =>
                  `${item.student} ${item.type}`.toLowerCase().includes(query) &&
                  (filter === "All" || item.status === filter),
              )
              .map((item) => (
                <tr key={item.id} className="hover:bg-accent/40">
                  <td className="px-5 py-3">
                    <p className="font-medium">{item.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.student} · {item.id}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge>{item.status}</StatusBadge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {item.uploadedDate || "Not uploaded"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{item.verifiedBy || "—"}</td>
                  <td className="px-5 py-3">
                    <Button variant="outline" size="sm">
                      Review
                    </Button>
                  </td>
                </tr>
              ))
          : module === "visa"
            ? records.visa
                .filter(
                  (item) =>
                    `${item.student} ${item.country} ${item.university}`
                      .toLowerCase()
                      .includes(query) &&
                    (filter === "All" || item.status === filter),
                )
                .map((item) => (
                  <tr key={item.id} className="hover:bg-accent/40">
                    <td className="px-5 py-3">
                      <p className="font-medium">{item.student}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.country} · {item.visaType}
                      </p>
                    </td>
                    <td className="px-5 py-3">{item.university}</td>
                    <td className="px-5 py-3">
                      <StatusBadge>{item.status}</StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {item.appointmentDate || "Not scheduled"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{item.documentStatus}</td>
                  </tr>
                ))
            : module === "payments"
              ? records.payments
                  .filter(
                    (item) =>
                      `${item.student} ${item.paymentType}`.toLowerCase().includes(query) &&
                      (filter === "All" || item.status === filter),
                  )
                  .map((item) => (
                    <tr key={item.id} className="hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <p className="font-medium">{item.student}</p>
                        <p className="text-xs text-muted-foreground">{item.paymentType}</p>
                      </td>
                      <td className="px-5 py-3 font-medium">
                        {formatAmount(item.amount, item.currency)}
                      </td>
                      <td className="px-5 py-3">{formatAmount(item.paidAmount, item.currency)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge>{item.status}</StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{item.dueDate}</td>
                    </tr>
                  ))
              : records["follow-ups"]
                  .filter(
                    (item) =>
                      `${item.student} ${item.type} ${item.counsellor}`
                        .toLowerCase()
                        .includes(query) &&
                      (filter === "All" || item.status === filter),
                  )
                  .map((item) => (
                    <tr key={item.id} className="hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <p className="font-medium">{item.student}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.type} · {item.counsellor}
                        </p>
                      </td>
                      <td className="px-5 py-3">{item.date}</td>
                      <td className="px-5 py-3">{item.time}</td>
                      <td className="px-5 py-3">
                        <StatusBadge>{item.status}</StatusBadge>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge>{item.priority}</StatusBadge>
                      </td>
                    </tr>
                  ));
  const headers =
    module === "universities"
      ? ["University", "Country", "Courses", "Ranking", "Difficulty", "Action"]
      : module === "applications"
        ? ["Student", "Course", "Status", "Deadline", "Counsellor"]
        : module === "documents"
          ? ["Document", "Status", "Uploaded", "Verified by", "Action"]
          : module === "visa"
            ? ["Student", "University", "Status", "Appointment", "Documents"]
            : module === "payments"
              ? ["Student", "Amount", "Paid", "Status", "Due date"]
              : ["Student", "Date", "Time", "Status", "Priority"];
  return (
    <div className="workspace-rise">
      <PageHeader
        title={config.title}
        description={config.description}
        action={config.action}
        onAction={module === "universities" ? openAddUniversity : undefined}
        extraActions={
          module === "universities" ? <UniversityImport onImported={loadUniversities} /> : undefined
        }
      />
      <TableToolbar
        search={search}
        setSearch={setSearch}
        filter={filter}
        setFilter={setFilter}
        filterOptions={config.filters}
      />
      <Card className="overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="px-5 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">{rows}</tbody>
          </table>
          {recordsError ? (
            <ErrorState message={recordsError} onRetry={reloadCurrent} />
          ) : recordsLoading ? (
            <LoadingState />
          ) : (
            rows.length === 0 &&
            ((module === "universities"
              ? universities.length
              : isRecordKey(module)
                ? records[module].length
                : 0) === 0 ? (
              <EmptyState
                title="No records yet"
                description="There are no records for this module in the database yet."
              />
            ) : (
              <EmptyState
                title="No matching records"
                description="Try changing the search or status filter."
              />
            ))
          )}
        </div>
      </Card>
      <Dialog open={addingUniversity} onOpenChange={setAddingUniversity}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add University</DialogTitle>

            <DialogDescription>Add a new university to the database.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* University Name */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              University Name
              <Input
                value={universityForm.name ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    name: event.target.value,
                  })
                }
                placeholder="e.g. Technical University of Munich"
              />
            </label>

            {/* Country */}
            <label className="grid gap-1.5 text-sm font-medium">
              Country
              <Input
                value={universityForm.country ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    country: event.target.value,
                  })
                }
              />
            </label>

            {/* City */}
            <label className="grid gap-1.5 text-sm font-medium">
              City
              <Input
                value={universityForm.city ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    city: event.target.value,
                  })
                }
                placeholder="Munich"
              />
            </label>

            {/* Ranking */}
            <label className="grid gap-1.5 text-sm font-medium">
              QS Ranking
              <Input
                value={universityForm.ranking ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    ranking: event.target.value,
                  })
                }
                placeholder="e.g. 22"
              />
            </label>

            {/* Difficulty */}
            {/* Difficulty */}
            <label className="grid gap-1.5 text-sm font-medium">
              Difficulty
              <select
                value={universityForm.difficulty ?? "Medium"}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    difficulty: event.target.value as "Easy" | "Medium" | "Hard" | "Very Hard",
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Very Hard">Very Hard</option>
              </select>
            </label>

            {/* Tuition Min */}
            <label className="grid gap-1.5 text-sm font-medium">
              Tuition Fee Min
              <Input
                type="number"
                value={universityForm.tuitionFeeMin ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    tuitionFeeMin: Number(event.target.value) || 0,
                  })
                }
              />
            </label>

            {/* Tuition Max */}
            <label className="grid gap-1.5 text-sm font-medium">
              Tuition Fee Max
              <Input
                type="number"
                value={universityForm.tuitionFeeMax ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    tuitionFeeMax: Number(event.target.value) || 0,
                  })
                }
              />
            </label>

            {/* Website */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Official Website
              <Input
                value={universityForm.website ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    website: event.target.value,
                  })
                }
                placeholder="https://..."
              />
            </label>

            {/* English Requirement */}
            <label className="grid gap-1.5 text-sm font-medium">
              IELTS / English Requirement
              <Input
                value={universityForm.englishRequirement ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    englishRequirement: event.target.value,
                  })
                }
                placeholder="IELTS 6.5"
              />
            </label>

            {/* Indian Percentage */}
            <label className="grid gap-1.5 text-sm font-medium">
              Recommended Indian %
              <Input
                value={universityForm.recommendedIndianPercentage ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    recommendedIndianPercentage: event.target.value,
                  })
                }
                placeholder="70%"
              />
            </label>

            {/* Application Opens */}
            <label className="grid gap-1.5 text-sm font-medium">
              Application Opens
              <Input
                value={universityForm.applicationOpens ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    applicationOpens: event.target.value,
                  })
                }
                placeholder="01 October"
              />
            </label>

            {/* Application Deadline */}
            <label className="grid gap-1.5 text-sm font-medium">
              Application Deadline
              <Input
                value={universityForm.applicationDeadline ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    applicationDeadline: event.target.value,
                  })
                }
                placeholder="15 January"
              />
            </label>

            {/* Popular Courses */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Popular Courses
              <Input
                value={universityForm.popularCourses?.join(", ") ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    popularCourses: event.target.value
                      .split(",")
                      .map((course) => course.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Computer Science, AI, Data Science"
              />
            </label>

            {/* Requirements */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Requirements
              <Input
                value={universityForm.requirements?.join(", ") ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    requirements: event.target.value
                      .split(",")
                      .map((requirement) => requirement.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="APS, IELTS, Bachelor's Degree"
              />
            </label>

            {/* Notes */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Notes
              <Textarea
                value={universityForm.notes ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Additional notes..."
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingUniversity(false)}>
              Cancel
            </Button>

            <Button onClick={saveUniversity}>Add University</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(selectedUniversity) && !editingUniversity}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUniversity(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selectedUniversity && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedUniversity.name}</DialogTitle>

                <DialogDescription>
                  {selectedUniversity.id} · {selectedUniversity.country} · {selectedUniversity.city}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Country
                  </p>

                  <p className="mt-1 text-sm font-medium">{selectedUniversity.country || "—"}</p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">City</p>

                  <p className="mt-1 text-sm font-medium">{selectedUniversity.city || "—"}</p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Ranking
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.ranking || "Not ranked"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Difficulty
                  </p>

                  <p className="mt-1 text-sm font-medium">{selectedUniversity.difficulty || "—"}</p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    English Requirement
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.englishRequirement || "—"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Indian Percentage
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.recommendedIndianPercentage || "—"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Application Opens
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.applicationOpens || "—"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Application Deadline
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.applicationDeadline || "—"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Popular Courses
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.popularCourses?.join(", ") || "No courses available"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Requirements
                  </p>

                  <p className="mt-1 text-sm font-medium">
                    {selectedUniversity.requirements?.join(", ") || "No requirements available"}
                  </p>
                </div>

                <div className="rounded-md border border-line/60 bg-secondary/40 p-3 sm:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Website
                  </p>

                  <p className="mt-1 text-sm font-medium break-all">
                    {selectedUniversity.website || "Not available"}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="destructive" onClick={() => deleteUniversity(selectedUniversity)}>
                  Delete
                </Button>

                <Button variant="outline" onClick={() => openEditUniversity(selectedUniversity)}>
                  Edit
                </Button>

                <Button variant="outline" onClick={() => setSelectedUniversity(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={editingUniversity}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUniversity(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit University</DialogTitle>

            <DialogDescription>Update university information.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* University Name */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              University Name
              <Input
                value={universityForm.name ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    name: event.target.value,
                  })
                }
              />
            </label>

            {/* Country */}
            <label className="grid gap-1.5 text-sm font-medium">
              Country
              <Input
                value={universityForm.country ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    country: event.target.value,
                  })
                }
              />
            </label>

            {/* City */}
            <label className="grid gap-1.5 text-sm font-medium">
              City
              <Input
                value={universityForm.city ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    city: event.target.value,
                  })
                }
              />
            </label>

            {/* Ranking */}
            <label className="grid gap-1.5 text-sm font-medium">
              QS Ranking
              <Input
                value={universityForm.ranking ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    ranking: event.target.value,
                  })
                }
              />
            </label>

            {/* Difficulty */}
            <label className="grid gap-1.5 text-sm font-medium">
              Difficulty
              <select
                value={universityForm.difficulty ?? "Medium"}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    difficulty: event.target.value as "Easy" | "Medium" | "Hard" | "Very Hard",
                  })
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="Very Hard">Very Hard</option>
              </select>
            </label>

            {/* Website */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Official Website
              <Input
                value={universityForm.website ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    website: event.target.value,
                  })
                }
              />
            </label>

            {/* English Requirement */}
            <label className="grid gap-1.5 text-sm font-medium">
              IELTS / English Requirement
              <Input
                value={universityForm.englishRequirement ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    englishRequirement: event.target.value,
                  })
                }
              />
            </label>

            {/* Recommended Indian Percentage */}
            <label className="grid gap-1.5 text-sm font-medium">
              Recommended Indian %
              <Input
                value={universityForm.recommendedIndianPercentage ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    recommendedIndianPercentage: event.target.value,
                  })
                }
              />
            </label>

            {/* Application Opens */}
            <label className="grid gap-1.5 text-sm font-medium">
              Application Opens
              <Input
                value={universityForm.applicationOpens ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    applicationOpens: event.target.value,
                  })
                }
              />
            </label>

            {/* Application Deadline */}
            <label className="grid gap-1.5 text-sm font-medium">
              Application Deadline
              <Input
                value={universityForm.applicationDeadline ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    applicationDeadline: event.target.value,
                  })
                }
              />
            </label>

            {/* Tuition Min */}
            <label className="grid gap-1.5 text-sm font-medium">
              Tuition Fee Min
              <Input
                type="number"
                value={universityForm.tuitionFeeMin ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    tuitionFeeMin: Number(event.target.value) || 0,
                  })
                }
              />
            </label>

            {/* Tuition Max */}
            <label className="grid gap-1.5 text-sm font-medium">
              Tuition Fee Max
              <Input
                type="number"
                value={universityForm.tuitionFeeMax ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    tuitionFeeMax: Number(event.target.value) || 0,
                  })
                }
              />
            </label>

            {/* Popular Courses */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Popular Courses
              <Input
                value={universityForm.popularCourses?.join(", ") ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    popularCourses: event.target.value
                      .split(",")
                      .map((course) => course.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Computer Science, AI, Data Science"
              />
            </label>

            {/* Requirements */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Requirements
              <Input
                value={universityForm.requirements?.join(", ") ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    requirements: event.target.value
                      .split(",")
                      .map((requirement) => requirement.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="APS, IELTS, Bachelor's Degree"
              />
            </label>

            {/* Notes */}
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Notes
              <Textarea
                value={universityForm.notes ?? ""}
                onChange={(event) =>
                  setUniversityForm({
                    ...universityForm,
                    notes: event.target.value,
                  })
                }
                placeholder="Additional notes..."
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingUniversity(false);

                if (selectedUniversity) {
                  setUniversityForm({
                    ...selectedUniversity,
                  });
                }
              }}
            >
              Cancel
            </Button>

            <Button onClick={saveUniversity}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssessmentModule() {
  const {
    data: students,
    loading: studentsLoading,
    error: studentsError,
    reload: reloadStudents,
  } = useStudents();

  const [studentId, setStudentId] = useState("");
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  const student = students?.find((item) => item.id === studentId) ?? students?.[0];

  const runAssessment = async (target: Student) => {
    setAssessing(true);
    setAssessmentError(null);

    try {
      setAssessment(await assessmentService.assessStudent(target));
    } catch (error) {
      console.error("Failed to run assessment:", error);
      setAssessment(null);
      setAssessmentError(error instanceof Error ? error.message : "Unable to run the assessment");
    } finally {
      setAssessing(false);
    }
  };

  useEffect(() => {
    if (student) runAssessment(student);
  }, [student?.id]);

  return (
    <div className="workspace-rise">
      <PageHeader
        title="Profile assessment"
        description={
          student
            ? `Counsellor-ready recommendations for ${student.name}.`
            : "Counsellor-ready recommendations from the student profile."
        }
        action={student ? "Run assessment" : undefined}
        onAction={student ? () => runAssessment(student) : undefined}
        extraActions={
          students && students.length > 0 ? (
            <select
              value={student?.id ?? ""}
              onChange={(event) => setStudentId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Student"
            >
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      {studentsError ? (
        <Card className="shadow-none">
          <ErrorState message={studentsError.message} onRetry={reloadStudents} />
        </Card>
      ) : studentsLoading ? (
        <Card className="shadow-none">
          <LoadingState label="Loading students..." />
        </Card>
      ) : !student ? (
        <Card className="shadow-none">
          <EmptyState
            title="No students yet"
            description="Add a student to run a profile assessment."
          />
        </Card>
      ) : assessmentError ? (
        <Card className="shadow-none">
          <ErrorState message={assessmentError} onRetry={() => runAssessment(student)} />
        </Card>
      ) : assessing || !assessment ? (
        <Card className="shadow-none">
          <LoadingState label="Running assessment..." />
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="workspace-glass shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Assessment summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{assessment.summary}</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">What is working</h3>
                    <ul className="space-y-2">
                      {assessment.requirements.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          {item}
                        </li>
                      ))}
                      {assessment.requirements.length === 0 && (
                        <li className="text-sm text-muted-foreground">No matching criteria yet.</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-semibold">Review before shortlist</h3>
                    <ul className="space-y-2">
                      {assessment.issues.map((item) => (
                        <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                          {item}
                        </li>
                      ))}
                      {assessment.issues.length === 0 && (
                        <li className="text-sm text-muted-foreground">Nothing to review.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Missing documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {assessment.missing.map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-md border border-line/60 bg-secondary/40 p-3 text-sm"
                  >
                    <span>{item}</span>
                    <Badge variant="outline" className="bg-warning/20 text-warning-foreground">
                      Pending
                    </Badge>
                  </div>
                ))}
                {assessment.missing.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No pending or rejected documents on record for this student.
                  </p>
                )}
                <Button className="mt-2 w-full" variant="outline">
                  Request documents
                </Button>
              </CardContent>
            </Card>
          </div>
          <Card className="mt-5 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">University matches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {assessment.matches.map((match) => (
                  <div
                    key={match.university}
                    className="rounded-lg border border-line/60 bg-secondary/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{match.university}</p>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{match.course}</p>
                    <div className="mt-4">
                      <StatusBadge>{match.status}</StatusBadge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {match.issue || "No additional review notes."}
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2 px-0">
                      {match.action} <ChevronRight />
                    </Button>
                  </div>
                ))}
              </div>
              {assessment.matches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No university lists a course matching this student's profile.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ReportsModule() {
  const { data: dashboard, loading, error, reload } = useDashboard();

  return (
    <div className="workspace-rise">
      <PageHeader
        title="Reports"
        description="Simple operating signals for the counselling team."
      />
      {!dashboard ? (
        <Card className="shadow-none">
          {error ? (
            <ErrorState message={error.message} onRetry={reload} />
          ) : (
            <LoadingState label={loading ? "Loading reports..." : "No report data"} />
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-3">
            <Card className="shadow-none">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Active students</p>
                <p className="mt-2 text-3xl font-semibold">{dashboard.reports.activeStudents}</p>
                <p className="mt-2 text-xs text-success-foreground">
                  Across {dashboard.reports.services} services
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Applications in motion</p>
                <p className="mt-2 text-3xl font-semibold">{dashboard.reports.applications}</p>
                <p className="mt-2 text-xs text-info-foreground">
                  {dashboard.reports.offers} offer received
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Outstanding payments</p>
                <p className="mt-2 text-3xl font-semibold">
                  {dashboard.reports.outstanding.length
                    ? dashboard.reports.outstanding
                        .map((item) => formatAmount(item.amount, item.currency))
                        .join(" + ")
                    : formatAmount(0)}
                </p>
                <p className="mt-2 text-xs text-warning-foreground">Needs collection follow-up</p>
              </CardContent>
            </Card>
          </div>
          <Card className="mt-5 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Enquiry trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-56 items-end gap-2 border-b border-line/60 pb-0">
                {dashboard.enquiryTrend.map((point) => (
                  <div
                    key={point.label}
                    className="group flex flex-1 flex-col items-center justify-end gap-2"
                  >
                    <div
                      className="w-full rounded-t-sm bg-primary/75 transition-colors group-hover:bg-primary"
                      style={{ height: `${point.height}%` }}
                      title={point.count !== undefined ? `${point.count} new students` : undefined}
                    />
                    <span className="text-[10px] text-muted-foreground">{point.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SettingsModule() {
  return (
    <div className="workspace-rise">
      <PageHeader title="Settings" description="Workspace preferences for the SS Overseas team." />
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Your profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand">
                MR
              </div>
              <div>
                <p className="font-medium">Manisha Rao</p>
                <p className="text-sm text-muted-foreground">Senior counsellor</p>
              </div>
            </div>
            <label className="grid gap-1.5 text-sm font-medium">
              Display name
              <Input defaultValue="Manisha Rao" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <Input defaultValue="manisha@ssoverseas.in" />
            </label>
            <Button>Save profile</Button>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Workspace preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Deadline reminders</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show urgent application and visa dates on the overview.
                </p>
              </div>
              <div className="h-5 w-9 rounded-full bg-primary p-0.5">
                <div className="h-4 w-4 translate-x-4 rounded-full bg-primary-foreground" />
              </div>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Activity updates</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep recent document and payment events visible.
                </p>
              </div>
              <div className="h-5 w-9 rounded-full bg-primary p-0.5">
                <div className="h-4 w-4 translate-x-4 rounded-full bg-primary-foreground" />
              </div>
            </div>
            <div className="rounded-md border border-line/60 bg-secondary/40 p-4">
              <p className="text-sm font-medium">
                {apiConfig.useMockData ? "Mock data mode" : "Connected to backend"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {apiConfig.useMockData
                  ? "Showing sample data. Set VITE_USE_MOCK_DATA=false to use the Node.js API and MongoDB."
                  : `Data is loaded from the API at ${apiConfig.baseUrl} (MongoDB).`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function CrmWorkspace({ module }: { module: ModuleKey }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useNotifications();
  const unreadNotifications = (notifications.data ?? []).filter((notice) => !notice.read);

  const markNotificationsRead = async () => {
    try {
      await Promise.all(
        unreadNotifications.map((notice) => notificationService.markRead(notice.id)),
      );
      notifications.reload();
      setNotificationsOpen(false);
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
      alert(error instanceof Error ? error.message : "Failed to mark notifications as read");
    }
  };
  const currentTitle =
    navigation.find((item) => item.key === module)?.label ??
    (module === "settings" ? "Settings" : "Overview");
  const navigateToModule = (next: ModuleKey) => {
    if (next === "dashboard") return navigate({ to: "/" });
    if (next === "students") return navigate({ to: "/students" });
    if (next === "universities") return navigate({ to: "/universities" });
    if (next === "courses") return navigate({ to: "/courses" });
    if (next === "explorer") return navigate({ to: "/explorer" });
    if (next === "applications") return navigate({ to: "/applications" });
    if (next === "documents") return navigate({ to: "/documents" });
    if (next === "visa") return navigate({ to: "/visa" });
    if (next === "payments") return navigate({ to: "/payments" });
    if (next === "follow-ups") return navigate({ to: "/follow-ups" });
    if (next === "pipelines") return navigate({ to: "/pipelines" });
    if (next === "assessment") return navigate({ to: "/assessment" });
    if (next === "reports") return navigate({ to: "/reports" });
    return navigate({ to: "/settings" });
  };
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar active={module} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="min-h-screen md:pl-64">
        <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">Workspace</span>
              <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:inline" />
              <span className="font-medium">{currentTitle}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden w-52 lg:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search workspace"
                  className="h-8 border-transparent bg-secondary/70 pl-9 text-xs"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open notifications"
                className="relative"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell />
                {unreadNotifications.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
                )}
              </Button>
              <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand sm:flex">
                MR
              </div>
            </div>
          </div>
          {notificationsOpen && (
            <div className="absolute right-4 top-14 z-40 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-line bg-card p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold">Notifications</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unreadNotifications.length === 0}
                  onClick={markNotificationsRead}
                >
                  Mark read
                </Button>
              </div>
              <div className="space-y-3">
                {notifications.error && (
                  <div className="text-sm text-danger-foreground">
                    {notifications.error.message}{" "}
                    <button type="button" className="underline" onClick={notifications.reload}>
                      Retry
                    </button>
                  </div>
                )}
                {notifications.loading && (
                  <p className="text-sm text-muted-foreground">Loading notifications...</p>
                )}
                {!notifications.loading &&
                  !notifications.error &&
                  notifications.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No notifications.</p>
                  )}
                {(notifications.data ?? []).slice(0, 4).map((notice) => (
                  <div key={notice.id} className="flex gap-3">
                    <div
                      className={`mt-1 h-2 w-2 rounded-full ${notice.tone === "warning" ? "bg-warning" : notice.tone === "success" ? "bg-success" : "bg-info"}`}
                    />
                    <div>
                      <p
                        className={`text-sm ${notice.read ? "text-muted-foreground" : "font-medium"}`}
                      >
                        {notice.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{notice.description}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{notice.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {module === "dashboard" ? (
            <Dashboard onNavigate={navigateToModule} />
          ) : module === "students" ? (
            <StudentsModule />
          ) : module === "courses" ? (
            <CoursesModule />
          ) : module === "explorer" ? (
            <UniversityExplorer />
          ) : module === "pipelines" ? (
            <PipelinesModule />
          ) : module === "settings" ? (
            <SettingsModule />
          ) : (
            <RecordsModule module={module} />
          )}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line/60 bg-card/95 p-1 backdrop-blur-xl md:hidden">
          {compactNavigation.map(({ label, to, key, icon: Icon }) => (
            <Link
              key={key}
              to={to}
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              className="flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium text-muted-foreground"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
