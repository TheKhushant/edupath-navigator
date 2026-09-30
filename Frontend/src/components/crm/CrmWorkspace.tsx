import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { studentService } from "@/services/crmServices";

import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
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
  Users,
  X,
} from "lucide-react";
// import { useNavigate } from "@tanstack/react-router";

import {
  mockApplications,
  mockAssessment,
  mockCountries,
  mockCourses,
  mockDocuments,
  mockFollowUps,
  mockNotifications,
  mockPayments,
  mockStudents,
  mockUniversities,
  mockVisaCases,
  dashboardData,
} from "@/data/mockData";
import { pipelineDefinitions } from "@/data/pipelineData";
import type { ServiceType, Student } from "@/types/crm";
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
  { label: "Applications", to: "/applications", key: "applications", icon: ClipboardList },
  { label: "Documents", to: "/documents", key: "documents", icon: FileCheck2 },
  { label: "Visa cases", to: "/visa", key: "visa", icon: BriefcaseBusiness },
  { label: "Payments", to: "/payments", key: "payments", icon: CircleDollarSign },
  { label: "Follow-ups", to: "/follow-ups", key: "follow-ups", icon: CalendarClock },
  { label: "Pipelines", to: "/pipelines", key: "pipelines", icon: GitBranch },
  { label: "Assessment", to: "/assessment", key: "assessment", icon: ClipboardCheck },
  { label: "Reports", to: "/reports", key: "reports", icon: BarChart3 },
];

const compactNavigation = navigation.slice(0, 5);
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
}: {
  title: string;
  description: string;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
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
  return (
    <div className="workspace-rise">
      <PageHeader
        title="Good morning, Manisha"
        description="A clear view of today’s student journeys and actions."
        action="Add student"
        onAction={() => onNavigate("students")}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {dashboardData.stats.map((stat, index) => {
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
              {dashboardData.pipeline.map((stage, index) => (
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
            {dashboardData.deadlines.map((item) => (
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
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="workspace-glass shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboardData.activities.map((activity) => (
              <div key={activity.title} className="flex gap-3">
                <div
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${activity.tone === "success" ? "bg-success" : activity.tone === "warning" ? "bg-warning" : "bg-brand"}`}
                />
                <div>
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{activity.detail}</p>
                </div>
                <span className="ml-auto text-[11px] text-muted-foreground">Today</span>
              </div>
            ))}
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
            {dashboardData.countryMix.map((item) => (
              <div key={item.country}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{item.country}</span>
                  <span className="font-medium">{item.count} students</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: item.width }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TableToolbar({
  search,
  setSearch,
  filter,
  setFilter,
  filterOptions,
}: {
  search: string;
  setSearch: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  filterOptions: string[];
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search records..."
          className="pl-9 bg-background/60"
        />
      </div>
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

  const confirmed = window.confirm(
    `Are you sure you want to delete ${selected.name}?`,
  );

  if (!confirmed) return;

  try {
    await studentService.deleteStudent(selected.id);

    setStudents((current) =>
      current.filter((student) => student.id !== selected.id),
    );

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
      id: `SS-2026-${String(students.length + 1).padStart(4, "0")}`,
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
                <Button
                  variant="destructive"
                  onClick={deleteStudent}
                >
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

                <Button onClick={saveStudent}>
                  Save changes
                </Button>
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
  const serviceStudents = mockStudents.filter((student) => student.service === service);

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
                      <p className="mt-2 text-[10px] text-muted-foreground">{student.counsellor}</p>
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
    </div>
  );
}

function RecordsModule({
  module,
}: {
  module: Exclude<ModuleKey, "dashboard" | "students" | "pipelines" | "settings">;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const config = {
    universities: {
      title: "Universities",
      description: "Compare verified institutions and programme requirements.",
      action: "Add university",
      filters: mockUniversities.map((item) => item.country),
    },
    courses: {
      title: "Courses",
      description: "Manage the pathways your counsellors recommend.",
      action: "Add course",
      filters: ["Active", "Draft"],
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
  const query = search.toLowerCase();
  if (module === "assessment") return <AssessmentModule />;
  if (module === "reports") return <ReportsModule />;
  const rows =
    module === "universities"
      ? mockUniversities
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
                  <p className="font-medium">University</p>
                  <p className="text-xs text-muted-foreground">
                    Programme details available in University Matcher
                  </p>
                </div>
              </td>

              <td className="px-5 py-3 text-muted-foreground">
                {item.lastVerified || "Not verified"}
              </td>

              <td className="px-5 py-3">
                <StatusBadge>Verified</StatusBadge>
              </td>
            </tr>
          ))
      : module === "courses"
        ? mockCourses
            .filter(
              (item) =>
                `${item.name} ${item.country} ${item.specialization}`
                  .toLowerCase()
                  .includes(query) &&
                (filter === "All" || item.status === filter),
            )
            .map((item) => (
              <tr key={item.id} className="hover:bg-accent/40">
                <td className="px-5 py-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.degree} · {item.duration}
                  </p>
                </td>
                <td className="px-5 py-3">{item.country}</td>
                <td className="px-5 py-3 text-muted-foreground">{item.specialization}</td>
                <td className="px-5 py-3 text-muted-foreground">{item.language}</td>
                <td className="px-5 py-3">
                  <StatusBadge>{item.status}</StatusBadge>
                </td>
              </tr>
            ))
        : module === "applications"
          ? mockApplications
              .filter(
                (item) =>
                  `${item.student} ${item.university} ${item.course}`
                    .toLowerCase()
                    .includes(query) &&
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
            ? mockDocuments
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
              ? mockVisaCases
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
                ? mockPayments
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
                          ₹{item.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-3">₹{item.paidAmount.toLocaleString("en-IN")}</td>
                        <td className="px-5 py-3">
                          <StatusBadge>{item.status}</StatusBadge>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{item.dueDate}</td>
                      </tr>
                    ))
                : mockFollowUps
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
      ? ["University", "Country", "Type", "Last verified", "Status"]
      : module === "courses"
        ? ["Course", "Country", "Specialization", "Language", "Status"]
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
      <PageHeader title={config.title} description={config.description} action={config.action} />
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
          {rows.length === 0 && (
            <EmptyState
              title="No matching records"
              description="Try changing the search or status filter."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function AssessmentModule() {
  return (
    <div className="workspace-rise">
      <PageHeader
        title="Profile assessment"
        description="Counsellor-ready recommendations for Rahul Sharma."
        action="Run assessment"
      />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="workspace-glass shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Assessment summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">{mockAssessment.summary}</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">What is working</h3>
                <ul className="space-y-2">
                  {mockAssessment.requirements.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">Review before shortlist</h3>
                <ul className="space-y-2">
                  {mockAssessment.issues.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
                      {item}
                    </li>
                  ))}
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
            {mockAssessment.missing.map((item) => (
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
            {mockAssessment.matches.map((match) => (
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
                <p className="mt-3 text-xs text-muted-foreground">No additional review notes.</p>
                <Button variant="ghost" size="sm" className="mt-2 px-0">
                  {match.action} <ChevronRight />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsModule() {
  return (
    <div className="workspace-rise">
      <PageHeader
        title="Reports"
        description="Simple operating signals for the counselling team."
      />
      <div className="grid gap-5 md:grid-cols-3">
        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Active students</p>
            <p className="mt-2 text-3xl font-semibold">
              {mockStudents.filter((student) => student.status === "Active").length}
            </p>
            <p className="mt-2 text-xs text-success-foreground">
              Across {new Set(mockStudents.map((student) => student.service)).size} services
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Applications in motion</p>
            <p className="mt-2 text-3xl font-semibold">{mockApplications.length}</p>
            <p className="mt-2 text-xs text-info-foreground">
              {mockApplications.filter((item) => item.status === "Offer Received").length} offer
              received
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Outstanding payments</p>
            <p className="mt-2 text-3xl font-semibold">
              ₹
              {mockPayments
                .filter((item) => item.status !== "Paid")
                .reduce((sum, item) => sum + item.amount - item.paidAmount, 0)
                .toLocaleString("en-IN")}
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
            {dashboardData.enquiryTrend.map((point) => (
              <div
                key={point.label}
                className="group flex flex-1 flex-col items-center justify-end gap-2"
              >
                <div
                  className="w-full rounded-t-sm bg-primary/75 transition-colors group-hover:bg-primary"
                  style={{ height: `${point.height}%` }}
                />
                <span className="text-[10px] text-muted-foreground">{point.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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
              <p className="text-sm font-medium">Mock data mode</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The workspace is ready to connect to your Node.js and MongoDB services when they are
                available.
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
  const currentTitle =
    navigation.find((item) => item.key === module)?.label ??
    (module === "settings" ? "Settings" : "Overview");
  const navigateToModule = (next: ModuleKey) => {
    if (next === "dashboard") return navigate({ to: "/" });
    if (next === "students") return navigate({ to: "/students" });
    if (next === "universities") return navigate({ to: "/universities" });
    if (next === "courses") return navigate({ to: "/courses" });
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
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
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
                <Button variant="ghost" size="sm" onClick={() => setNotificationsOpen(false)}>
                  Mark read
                </Button>
              </div>
              <div className="space-y-3">
                {mockNotifications.slice(0, 4).map((notice) => (
                  <div key={notice.id} className="flex gap-3">
                    <div
                      className={`mt-1 h-2 w-2 rounded-full ${notice.tone === "warning" ? "bg-warning" : notice.tone === "success" ? "bg-success" : "bg-info"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">{notice.title}</p>
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
