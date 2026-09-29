import { useEffect, useState } from "react";
import { applicationService, assessmentService, countryService, courseService, dashboardService, documentService, followupService, notificationService, paymentService, studentService, universityService, visaService } from "@/services/crmServices";
import type { Application, AssessmentResult, Country, Course, DashboardData, DocumentRecord, FollowUp, Notification, Payment, Student, University, VisaCase } from "@/types/crm";

type QueryState<T> = { data: T | undefined; loading: boolean; error: Error | undefined };
function useService<T>(load: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: true, error: undefined });
  useEffect(() => { let active = true; setState({ data: undefined, loading: true, error: undefined }); load().then((data) => { if (active) setState({ data, loading: false, error: undefined }); }).catch((error: unknown) => { if (active) setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error("Unable to load records") }); }); return () => { active = false; }; }, [load]);
  return state;
}
export const useDashboard = () => useService<DashboardData>(() => dashboardService.getDashboard());
export const useStudents = () => useService<Student[]>(() => studentService.getStudents());
export const useStudent = (id: string) => useService<Student | undefined>(() => studentService.getStudentById(id));
export const useUniversities = () => useService<University[]>(() => universityService.getUniversities());
export const useUniversity = (id: string) => useService<University | undefined>(() => universityService.getUniversityById(id));
export const useCourses = () => useService<Course[]>(() => courseService.getCourses());
export const useCountries = () => useService<Country[]>(() => countryService.getCountries());
export const useApplications = () => useService<Application[]>(() => applicationService.getApplications());
export const useApplication = (id: string) => useService<Application | undefined>(() => applicationService.getApplicationById(id));
export const useDocuments = () => useService<DocumentRecord[]>(() => documentService.getDocuments());
export const useVisaCases = () => useService<VisaCase[]>(() => visaService.getVisaCases());
export const usePayments = () => useService<Payment[]>(() => paymentService.getPayments());
export const useFollowUps = () => useService<FollowUp[]>(() => followupService.getFollowUps());
export const useNotifications = () => useService<Notification[]>(() => notificationService.getNotifications());
export const useAssessment = () => useService<AssessmentResult>(() => assessmentService.assessStudent());
