import { apiConfig } from "@/lib/api";
import { dashboardData, mockApplications, mockAssessment, mockCountries, mockCourses, mockDocuments, mockFollowUps, mockNotifications, mockPayments, mockStudents, mockUniversities, mockVisaCases, mockUniversityCourses } from "@/data/mockData";
import type {
  Application,
  AssessmentResult,
  Country,
  Course,
  DashboardData,
  DocumentRecord,
  FollowUp,
  Notification,
  Payment,
  Student,
  University,
  UniversityCourse,
  VisaCase
} from "@/types/crm";

const clone = <T,>(value: T): T => structuredClone(value);
const wait = async <T,>(value: T): Promise<T> => { await new Promise((resolve) => setTimeout(resolve, 120)); return clone(value); };

export const universityCourseService = {
  getUniversityCourses: async (): Promise<UniversityCourse[]> =>
    wait(mockUniversityCourses),

  getByUniversityId: async (
    universityId: string
  ): Promise<UniversityCourse[]> =>
    wait(
      mockUniversityCourses.filter(
        (course) => course.universityId === universityId
      )
    ),
};

export const studentService = {
  getStudents: async (): Promise<Student[]> => apiConfig.useMockData ? wait(mockStudents) : (await import("@/lib/api")).apiRequest<Student[]>("/students"),
  getStudentById: async (id: string): Promise<Student | undefined> => wait(mockStudents.find((student) => student.id === id)),
  createStudent: async (data: Student): Promise<Student> => wait(data),
  updateStudent: async (id: string, data: Partial<Student>): Promise<Student | undefined> => wait({ ...mockStudents.find((student) => student.id === id), ...data } as Student),
  deleteStudent: async (id: string): Promise<{ id: string }> => wait({ id }),
};
export const universityService = { getUniversities: async (): Promise<University[]> => wait(mockUniversities), getUniversityById: async (id: string) => wait(mockUniversities.find((item) => item.id === id)), createUniversity: async (data: University) => wait(data), updateUniversity: async (id: string, data: Partial<University>) => wait({ ...mockUniversities.find((item) => item.id === id), ...data } as University) };
export const courseService = { getCourses: async (): Promise<Course[]> => wait(mockCourses), createCourse: async (data: Course) => wait(data) };
export const countryService = { getCountries: async (): Promise<Country[]> => wait(mockCountries) };
export const applicationService = { getApplications: async (): Promise<Application[]> => wait(mockApplications), getApplicationById: async (id: string) => wait(mockApplications.find((item) => item.id === id)), createApplication: async (data: Application) => wait(data), updateApplication: async (id: string, data: Partial<Application>) => wait({ ...mockApplications.find((item) => item.id === id), ...data } as Application) };
export const documentService = { getDocuments: async (): Promise<DocumentRecord[]> => wait(mockDocuments), uploadDocument: async (data: DocumentRecord) => wait(data), updateDocumentStatus: async (id: string, status: DocumentRecord["status"]) => wait({ id, status }) };
export const visaService = { getVisaCases: async (): Promise<VisaCase[]> => wait(mockVisaCases), createVisaCase: async (data: VisaCase) => wait(data), updateVisaCase: async (id: string, data: Partial<VisaCase>) => wait({ ...mockVisaCases.find((item) => item.id === id), ...data } as VisaCase) };
export const paymentService = { getPayments: async (): Promise<Payment[]> => wait(mockPayments), createPayment: async (data: Payment) => wait(data), updatePayment: async (id: string, data: Partial<Payment>) => wait({ ...mockPayments.find((item) => item.id === id), ...data } as Payment) };
export const followupService = { getFollowUps: async (): Promise<FollowUp[]> => wait(mockFollowUps), createFollowUp: async (data: FollowUp) => wait(data), updateFollowUp: async (id: string, data: Partial<FollowUp>) => wait({ ...mockFollowUps.find((item) => item.id === id), ...data } as FollowUp) };
export const notificationService = { getNotifications: async (): Promise<Notification[]> => wait(mockNotifications), markAllRead: async () => wait(true) };
export const dashboardService = { getDashboard: async (): Promise<DashboardData> => wait(dashboardData) };
export const assessmentService = { assessStudent: async (): Promise<AssessmentResult> => wait(mockAssessment) };
