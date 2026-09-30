import { useCallback, useEffect, useRef, useState } from "react";
import {
  applicationService,
  countryService,
  courseService,
  dashboardService,
  documentService,
  followupService,
  notificationService,
  paymentService,
  studentService,
  universityCourseService,
  universityService,
  visaService,
} from "@/services/crmServices";
import type {
  Application,
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
  VisaCase,
} from "@/types/crm";

export type QueryState<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
};

/**
 * Loads data from a service once (and again when `key` changes or `reload`
 * is called). The latest loader is kept in a ref so an inline arrow
 * function does not trigger a new request on every render.
 */
function useService<T>(load: () => Promise<T>, key = ""): QueryState<T> {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<QueryState<T>, "reload">>({
    data: undefined,
    loading: true,
    error: undefined,
  });

  useEffect(() => {
    let active = true;

    setState((current) => ({ ...current, loading: true, error: undefined }));

    loadRef
      .current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: undefined });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            data: undefined,
            loading: false,
            error: error instanceof Error ? error : new Error("Unable to load records"),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [key, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, reload };
}

export const useDashboard = () => useService<DashboardData>(() => dashboardService.getDashboard());
export const useStudents = () => useService<Student[]>(() => studentService.getStudents());
export const useStudent = (id: string) =>
  useService<Student | undefined>(() => studentService.getStudentById(id), id);
export const useUniversities = () =>
  useService<University[]>(() => universityService.getUniversities());
export const useUniversity = (id: string) =>
  useService<University | undefined>(() => universityService.getUniversityById(id), id);
export const useUniversityCourses = () =>
  useService<UniversityCourse[]>(() => universityCourseService.getUniversityCourses());
export const useCourses = () => useService<Course[]>(() => courseService.getCourses());
export const useCountries = () => useService<Country[]>(() => countryService.getCountries());
export const useApplications = () =>
  useService<Application[]>(() => applicationService.getApplications());
export const useApplication = (id: string) =>
  useService<Application | undefined>(() => applicationService.getApplicationById(id), id);
export const useDocuments = () =>
  useService<DocumentRecord[]>(() => documentService.getDocuments());
export const useVisaCases = () => useService<VisaCase[]>(() => visaService.getVisaCases());
export const usePayments = () => useService<Payment[]>(() => paymentService.getPayments());
export const useFollowUps = () => useService<FollowUp[]>(() => followupService.getFollowUps());
export const useNotifications = () =>
  useService<Notification[]>(() => notificationService.getNotifications());
