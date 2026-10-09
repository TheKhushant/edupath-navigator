import { apiConfig, apiDownload, apiRequest } from "@/lib/api";
import { buildAssessment } from "@/services/studentAssessment";
import {
  dashboardData,
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
  mockUniversityCourses,
} from "@/data/mockData";
import type {
  ExcelCustomFieldDefinition,
  ExcelImportProgress,
  ExcelImportOptions,
  ExcelImportPreview,
  ExcelImportResult,
  Application,
  AssessmentResult,
  Country,
  Course,
  CourseSearchParams,
  DashboardData,
  DocumentRecord,
  ExplorerCourse,
  ExplorerFacets,
  ExplorerItems,
  ExplorerUniversity,
  FollowUp,
  Notification,
  Payment,
  SearchAnalyticsEntry,
  SearchInfo,
  SearchMatch,
  SearchPage,
  SearchTag,
  SearchTagInput,
  SearchTagRelation,
  Student,
  University,
  UniversityCourse,
  VisaCase,
} from "@/types/crm";

const clone = <T>(value: T): T => structuredClone(value);
const wait = async <T>(value: T): Promise<T> => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return clone(value);
};
/* =========================================================
   BULK DELETE (POST /<resource>/bulk-delete, at most 500 ids per call)
========================================================= */

export interface BulkDeleteResult {
  deleted: number;
  deletedIds: string[];
  /** Ids that matched no record (e.g. already deleted). */
  notFound: string[];
}

const BULK_DELETE_BATCH = 500;

async function bulkDelete(resource: string, ids: string[]): Promise<BulkDeleteResult> {
  if (apiConfig.useMockData) return wait({ deleted: ids.length, deletedIds: ids, notFound: [] });

  const total: BulkDeleteResult = { deleted: 0, deletedIds: [], notFound: [] };

  for (let start = 0; start < ids.length; start += BULK_DELETE_BATCH) {
    const response = await apiRequest<{ success: boolean; data: BulkDeleteResult }>(
      `/${resource}/bulk-delete`,
      {
        method: "POST",
        body: JSON.stringify({ ids: ids.slice(start, start + BULK_DELETE_BATCH) }),
      },
    );
    total.deleted += response.data.deleted;
    total.deletedIds.push(...response.data.deletedIds);
    total.notFound.push(...response.data.notFound);
  }

  return total;
}

export const universityService = {
  bulkDeleteUniversities: (ids: string[]) => bulkDelete("universities", ids),

  getUniversities: async (): Promise<University[]> => {
    if (apiConfig.useMockData) {
      return wait(mockUniversities);
    }

    const response = await apiRequest<{
      success: boolean;
      count: number;
      data: University[];
    }>("/universities");

    return response.data;
  },

  getUniversityById: async (id: string): Promise<University | undefined> => {
    if (apiConfig.useMockData) {
      return wait(mockUniversities.find((university) => university.id === id));
    }

    const response = await apiRequest<{
      success: boolean;
      data: University;
    }>(`/universities/${id}`);

    return response.data;
  },

  createUniversity: async (data: University): Promise<University> => {
    if (apiConfig.useMockData) {
      return wait(data);
    }

    const response = await apiRequest<{
      success: boolean;
      data: University;
    }>("/universities", {
      method: "POST",
      body: JSON.stringify(data),
    });

    return response.data;
  },

  updateUniversity: async (id: string, data: Partial<University>): Promise<University> => {
    if (apiConfig.useMockData) {
      return wait({
        ...mockUniversities.find((university) => university.id === id),
        ...data,
      } as University);
    }

    const response = await apiRequest<{
      success: boolean;
      data: University;
    }>(`/universities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    return response.data;
  },

  deleteUniversity: async (id: string): Promise<University> => {
    if (apiConfig.useMockData) {
      return wait(mockUniversities.find((university) => university.id === id) as University);
    }

    const response = await apiRequest<{
      success: boolean;
      data: University;
    }>(`/universities/${id}`, {
      method: "DELETE",
    });

    return response.data;
  },
};

/*
 * The workbook is sent as the raw request body; options go in the query string.
 * Column selections (if any) are UTF-8 JSON placed in front of the workbook,
 * with their byte length in ?selectionsLength (see universityImportController).
 */
const importRequest = (
  file: File,
  options: ExcelImportOptions,
  extra: Record<string, string> = {},
): { query: string; body: Blob | File } => {
  const params = new URLSearchParams({
    fileName: file.name,
    mode: options.mode,
    defaultCountry: options.defaultCountry,
    ...(options.progressId ? { progressId: options.progressId } : {}),
    ...extra,
  });

  if (!options.selections) return { query: params.toString(), body: file };

  const json = new TextEncoder().encode(JSON.stringify(options.selections));
  params.set("selectionsLength", String(json.byteLength));

  return { query: params.toString(), body: new Blob([json, file]) };
};

const requireBackend = () => {
  if (apiConfig.useMockData) {
    throw new Error("Excel import needs the backend. Set VITE_USE_MOCK_DATA=false.");
  }
};

/**
 * POST with upload progress (fetch cannot report it). Same JSON error
 * handling as apiRequest.
 */
const postWithUploadProgress = <T>(
  path: string,
  body: Blob | File,
  onUploadProgress: (percent: number) => void,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${apiConfig.baseUrl}${path}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    request.onload = () => {
      let data: { message?: string; error?: string } | null = null;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        data = null;
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(data as T);
      } else {
        reject(
          new Error(data?.message || data?.error || `Request failed with status ${request.status}`),
        );
      }
    };

    // Small bodies may not fire progress events; the upload has finished here
    request.upload.onload = () => onUploadProgress(100);

    request.onerror = () => reject(new Error("Network error: the server could not be reached."));
    request.send(body);
  });

const postImport = <T>(path: string, body: Blob | File, options: ExcelImportOptions) =>
  options.onUploadProgress
    ? postWithUploadProgress<T>(path, body, options.onUploadProgress)
    : apiRequest<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });

export const universityImportService = {
  downloadTemplate: async (): Promise<Blob> => {
    requireBackend();
    return apiDownload("/universities/import/template");
  },

  /** Scans and validates the workbook. Does not modify the database. */
  previewImport: async (file: File, options: ExcelImportOptions): Promise<ExcelImportPreview> => {
    requireBackend();

    const { query, body } = importRequest(file, options);
    const response = await postImport<{ success: boolean; data: ExcelImportPreview }>(
      `/universities/import/preview?${query}`,
      body,
      options,
    );

    return response.data;
  },

  /** Saved custom field definitions (labels and types for customFields values). */
  getCustomFields: async (): Promise<ExcelCustomFieldDefinition[]> => {
    requireBackend();
    const response = await apiRequest<{ success: boolean; data: ExcelCustomFieldDefinition[] }>(
      "/universities/import/custom-fields",
    );
    return response.data;
  },

  /** Server-side progress of a running preview/import, or null when unknown. */
  getProgress: async (progressId: string): Promise<ExcelImportProgress | null> => {
    // Plain fetch: "not started yet" (404) is expected and is not logged as an API error
    try {
      const response = await fetch(
        `${apiConfig.baseUrl}/universities/import/progress/${encodeURIComponent(progressId)}`,
      );
      if (!response.ok) return null;
      const body = (await response.json()) as { data?: ExcelImportProgress };
      return body.data ?? null;
    } catch {
      return null;
    }
  },

  /** Re-validates the same file on the server and imports the valid rows. */
  confirmImport: async (
    file: File,
    options: ExcelImportOptions & {
      expectedHash: string;
      confirmOverwrite: boolean;
      /** Required when the import creates new custom fields. */
      confirmCustomFields?: boolean;
    },
  ): Promise<ExcelImportResult> => {
    requireBackend();

    const { query, body } = importRequest(file, options, {
      expectedHash: options.expectedHash,
      confirmOverwrite: String(options.confirmOverwrite),
      confirmCustomFields: String(options.confirmCustomFields ?? false),
    });
    const response = await postImport<{ success: boolean; data: ExcelImportResult }>(
      `/universities/import/confirm?${query}`,
      body,
      options,
    );

    return response.data;
  },
};

/** Backend Country documents use `name` where the frontend type uses `country`. */
type CountryRecord = Omit<Country, "country"> & { name: string };

const toCountry = ({ name, ...country }: CountryRecord): Country => ({
  ...country,
  country: name,
});

export const countryService = {
  getCountries: async (): Promise<Country[]> => {
    if (apiConfig.useMockData) {
      return wait(mockCountries);
    }

    const response = await apiRequest<{
      success: boolean;
      count: number;
      data: CountryRecord[];
    }>("/countries");

    return response.data.map(toCountry);
  },
};

export const studentService = {
  bulkDeleteStudents: (ids: string[]) => bulkDelete("students", ids),

  getStudents: async (): Promise<Student[]> => {
    if (apiConfig.useMockData) {
      return wait(mockStudents);
    }

    const response = await apiRequest<{
      success: boolean;
      count: number;
      data: Student[];
    }>("/students");

    return response.data;
  },

  getStudentById: async (id: string): Promise<Student | undefined> => {
    if (apiConfig.useMockData) {
      return wait(mockStudents.find((student) => student.id === id));
    }

    const response = await apiRequest<{
      success: boolean;
      data: Student;
    }>(`/students/${id}`);

    return response.data;
  },

  createStudent: async (data: Student): Promise<Student> => {
    if (apiConfig.useMockData) {
      return wait(data);
    }

    const response = await apiRequest<{
      success: boolean;
      data: Student;
    }>("/students", {
      method: "POST",
      body: JSON.stringify(data),
    });

    return response.data;
  },

  updateStudent: async (id: string, data: Partial<Student>): Promise<Student> => {
    if (apiConfig.useMockData) {
      return wait({
        ...mockStudents.find((student) => student.id === id),
        ...data,
      } as Student);
    }

    const response = await apiRequest<{
      success: boolean;
      data: Student;
    }>(`/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    return response.data;
  },

  deleteStudent: async (id: string): Promise<Student> => {
    if (apiConfig.useMockData) {
      return wait(mockStudents.find((student) => student.id === id) as Student);
    }

    const response = await apiRequest<{
      success: boolean;
      data: Student;
    }>(`/students/${id}`, {
      method: "DELETE",
    });

    return response.data;
  },
};

/* =========================================================
   BACKEND RECORD SHAPES
   Mongo documents use studentName / universityName / courseName and
   ObjectId references; the frontend types use display names and the
   readable external IDs. Missing text fields map to "" (not recorded).
========================================================= */

interface ListResponse<T> {
  success: boolean;
  count: number;
  data: T[];
}

interface ItemResponse<T> {
  success: boolean;
  data: T;
}

/** List endpoints called with ?q / ?page return the ranked page plus search details. */
interface SearchResponse<T> extends ListResponse<T> {
  total: number;
  page: number;
  limit: number;
  search: SearchInfo | null;
}

const searchQuery = ({ q, status, page, limit }: CourseSearchParams) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q?.trim()) params.set("q", q.trim());
  if (status && status !== "All") params.set("status", status);
  return params.toString();
};

/** Mock mode: plain substring search, no tag expansion. */
const mockSearchPage = <T>(
  records: T[],
  { q, status, page, limit }: CourseSearchParams,
  haystack: (record: T) => string,
  recordStatus: (record: T) => string | undefined,
): SearchPage<T> => {
  const query = q?.trim().toLowerCase() ?? "";
  const matches = records.filter(
    (record) =>
      haystack(record).toLowerCase().includes(query) &&
      (!status || status === "All" || recordStatus(record) === status),
  );

  return {
    data: matches.slice((page - 1) * limit, page * limit),
    total: matches.length,
    page,
    limit,
    search: null,
  };
};

interface MongoRecord {
  _id: string;
  id?: string;
}

interface StudentLinkedRecord extends MongoRecord {
  studentId?: string;
  studentExternalId?: string;
  studentName?: string;
}

const recordId = (record: MongoRecord) => record.id || record._id;
const text = (value: string | undefined) => value ?? "";

interface ApplicationRecord extends StudentLinkedRecord {
  universityName?: string;
  courseName?: string;
  intake?: string;
  status?: string;
  deadline?: string;
  submissionDate?: string;
  offerStatus?: string;
  counsellor?: string;
  notes?: string;
}

const toApplication = (record: ApplicationRecord): Application => {
  const application: Application = {
    id: recordId(record),
    studentId: record.studentExternalId || text(record.studentId),
    student: text(record.studentName),
    university: text(record.universityName),
    course: text(record.courseName),
    intake: text(record.intake),
    status: text(record.status),
    deadline: text(record.deadline),
    offerStatus: text(record.offerStatus),
    counsellor: text(record.counsellor),
    notes: text(record.notes),
  };
  if (record.submissionDate) application.submissionDate = record.submissionDate;
  return application;
};

interface DocumentApiRecord extends StudentLinkedRecord {
  type?: string;
  status?: string;
  uploadedDate?: string;
  verifiedBy?: string;
  notes?: string;
}

const toDocument = (record: DocumentApiRecord): DocumentRecord => {
  const document: DocumentRecord = {
    id: recordId(record),
    student: text(record.studentName),
    studentId: record.studentExternalId || text(record.studentId),
    type: text(record.type),
    status: text(record.status),
    notes: text(record.notes),
  };
  if (record.uploadedDate) document.uploadedDate = record.uploadedDate;
  if (record.verifiedBy) document.verifiedBy = record.verifiedBy;
  return document;
};

interface VisaCaseRecord extends StudentLinkedRecord {
  country?: string;
  university?: string;
  visaType?: string;
  applicationDate?: string;
  appointmentDate?: string;
  documentStatus?: string;
  status?: string;
  notes?: string;
}

const toVisaCase = (record: VisaCaseRecord): VisaCase => {
  const visaCase: VisaCase = {
    id: recordId(record),
    student: text(record.studentName),
    country: text(record.country),
    university: text(record.university),
    visaType: text(record.visaType),
    applicationDate: text(record.applicationDate),
    documentStatus: text(record.documentStatus),
    status: text(record.status),
    notes: text(record.notes),
  };
  if (record.appointmentDate) visaCase.appointmentDate = record.appointmentDate;
  return visaCase;
};

interface PaymentRecord extends StudentLinkedRecord {
  service?: string;
  paymentType?: string;
  amount: number;
  paidAmount?: number;
  currency?: string;
  dueDate?: string;
  paymentDate?: string;
  status?: string;
  method?: string;
  paymentMethod?: string;
  notes?: string;
}

const toPayment = (record: PaymentRecord): Payment => {
  const payment: Payment = {
    id: recordId(record),
    student: text(record.studentName),
    service: text(record.service),
    paymentType: text(record.paymentType),
    amount: record.amount,
    // The Payment schema defaults paidAmount to 0
    paidAmount: record.paidAmount ?? 0,
    dueDate: text(record.dueDate),
    status: text(record.status),
    method: record.method || text(record.paymentMethod),
    notes: text(record.notes),
  };
  if (record.currency) payment.currency = record.currency;
  if (record.paymentDate) payment.paymentDate = record.paymentDate;
  return payment;
};

interface FollowUpRecord extends StudentLinkedRecord {
  counsellor?: string;
  assignedTo?: string;
  title?: string;
  type?: string;
  date?: string;
  dueDate?: string;
  time?: string;
  priority?: string;
  status?: string;
  notes?: string;
  description?: string;
}

const toFollowUp = (record: FollowUpRecord): FollowUp => ({
  id: recordId(record),
  student: text(record.studentName),
  counsellor: record.counsellor || text(record.assignedTo),
  type: record.type || text(record.title),
  date: record.date || text(record.dueDate),
  time: text(record.time),
  priority: text(record.priority),
  status: text(record.status),
  notes: record.notes || text(record.description),
});

interface NotificationRecord extends MongoRecord {
  title: string;
  description?: string;
  message?: string;
  category?: string;
  type?: string;
  time?: string;
  tone?: string;
  read?: boolean;
}

const toNotification = (record: NotificationRecord): Notification => ({
  id: recordId(record),
  title: record.title,
  description: record.description || text(record.message),
  category: record.category || text(record.type),
  time: text(record.time),
  tone: text(record.tone),
  // The Notification schema defaults read to false
  read: record.read ?? false,
});

interface CourseRecord extends MongoRecord {
  name: string;
  degree?: string;
  specialization?: string;
  country?: string;
  duration?: string;
  language?: string;
  requirements?: string;
  notes?: string;
  status?: string;
  field?: string;
  customSearchTags?: string[];
  searchTags?: string[];
  searchMatch?: SearchMatch;
}

const toCourse = (record: CourseRecord): Course => {
  const course: Course = {
    id: recordId(record),
    name: record.name,
    degree: text(record.degree),
    specialization: text(record.specialization),
    country: text(record.country),
    duration: text(record.duration),
    language: text(record.language),
    requirements: text(record.requirements),
    notes: text(record.notes),
    status: text(record.status),
    customSearchTags: record.customSearchTags ?? [],
    searchTags: record.searchTags ?? [],
  };
  if (record.field) course.field = record.field;
  if (record.searchMatch) course.searchMatch = record.searchMatch;
  return course;
};

interface SearchTagRecord extends MongoRecord {
  name: string;
  key: string;
  aliases?: string[];
  related?: { tag: (MongoRecord & { name?: string }) | null; relation: SearchTagRelation }[];
  category?: string;
  status?: "active" | "inactive";
}

const toSearchTag = (record: SearchTagRecord): SearchTag => {
  const tag: SearchTag = {
    id: record._id,
    key: record.key,
    name: record.name,
    aliases: record.aliases ?? [],
    // Relations to deleted tags come back unpopulated (null) and are skipped
    related: (record.related ?? []).flatMap((item) =>
      item.tag ? [{ id: item.tag._id, name: text(item.tag.name), relation: item.relation }] : [],
    ),
    status: record.status ?? "active",
  };
  if (record.category) tag.category = record.category;
  return tag;
};

/** GET /university-courses populates universityId with the University document. */
interface UniversityCourseRecord
  extends MongoRecord, Omit<UniversityCourse, "id" | "universityId" | "universityName"> {
  universityId?: string | (MongoRecord & { name?: string }) | null;
  universityExternalId?: string;
  universityName?: string;
}

const toUniversityCourse = ({
  _id,
  id,
  universityId,
  universityExternalId,
  universityName,
  ...rest
}: UniversityCourseRecord): UniversityCourse => {
  const university = typeof universityId === "object" && universityId ? universityId : undefined;
  const course: UniversityCourse = {
    ...rest,
    id: id || _id,
    universityId:
      universityExternalId ||
      (university ? recordId(university) : typeof universityId === "string" ? universityId : ""),
  };
  const name = universityName || university?.name;
  if (name) course.universityName = name;
  return course;
};

/* =========================================================
   LIST SERVICES (the UI lists and filters these records)
========================================================= */

export const applicationService = {
  getApplications: async (): Promise<Application[]> => {
    if (apiConfig.useMockData) return wait(mockApplications);

    const response = await apiRequest<ListResponse<ApplicationRecord>>("/applications");
    return response.data.map(toApplication);
  },

  getApplicationById: async (id: string): Promise<Application | undefined> => {
    if (apiConfig.useMockData) return wait(mockApplications.find((item) => item.id === id));

    const response = await apiRequest<ItemResponse<ApplicationRecord>>(`/applications/${id}`);
    return toApplication(response.data);
  },
};

export const documentService = {
  getDocuments: async (): Promise<DocumentRecord[]> => {
    if (apiConfig.useMockData) return wait(mockDocuments);

    const response = await apiRequest<ListResponse<DocumentApiRecord>>("/documents");
    return response.data.map(toDocument);
  },
};

export const visaService = {
  getVisaCases: async (): Promise<VisaCase[]> => {
    if (apiConfig.useMockData) return wait(mockVisaCases);

    const response = await apiRequest<ListResponse<VisaCaseRecord>>("/visa-cases");
    return response.data.map(toVisaCase);
  },
};

export const paymentService = {
  getPayments: async (): Promise<Payment[]> => {
    if (apiConfig.useMockData) return wait(mockPayments);

    const response = await apiRequest<ListResponse<PaymentRecord>>("/payments");
    return response.data.map(toPayment);
  },
};

export const followupService = {
  getFollowUps: async (): Promise<FollowUp[]> => {
    if (apiConfig.useMockData) return wait(mockFollowUps);

    const response = await apiRequest<ListResponse<FollowUpRecord>>("/follow-ups");
    return response.data.map(toFollowUp);
  },
};

export const notificationService = {
  getNotifications: async (): Promise<Notification[]> => {
    if (apiConfig.useMockData) return wait(mockNotifications);

    const response = await apiRequest<ListResponse<NotificationRecord>>("/notifications");
    return response.data.map(toNotification);
  },

  markRead: async (id: string): Promise<Notification> => {
    if (apiConfig.useMockData) {
      const notification = mockNotifications.find((item) => item.id === id);
      if (!notification) throw new Error("Notification not found");
      return wait({ ...notification, read: true });
    }

    const response = await apiRequest<ItemResponse<NotificationRecord>>(`/notifications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
    return toNotification(response.data);
  },
};

export const courseService = {
  bulkDeleteCourses: (ids: string[]) => bulkDelete("courses", ids),

  getCourses: async (): Promise<Course[]> => {
    if (apiConfig.useMockData) return wait(mockCourses);

    const response = await apiRequest<ListResponse<CourseRecord>>("/courses");
    return response.data.map(toCourse);
  },

  /** Ranked search with related search tags, filtered and paginated on the server. */
  searchCourses: async (params: CourseSearchParams): Promise<SearchPage<Course>> => {
    if (apiConfig.useMockData) {
      return wait(
        mockSearchPage(
          mockCourses,
          params,
          (course) => `${course.name} ${course.country} ${course.specialization}`,
          (course) => course.status,
        ),
      );
    }

    const response = await apiRequest<SearchResponse<CourseRecord>>(
      `/courses?${searchQuery(params)}`,
    );
    return { ...response, data: response.data.map(toCourse) };
  },

  createCourse: async (data: Partial<Course>): Promise<Course> => {
    if (apiConfig.useMockData) return wait({ ...data, id: `CRS-${Date.now()}` } as Course);

    const response = await apiRequest<ItemResponse<CourseRecord>>("/courses", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return toCourse(response.data);
  },

  updateCourse: async (id: string, data: Partial<Course>): Promise<Course> => {
    if (apiConfig.useMockData) {
      return wait({ ...mockCourses.find((course) => course.id === id), ...data } as Course);
    }

    const response = await apiRequest<ItemResponse<CourseRecord>>(`/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return toCourse(response.data);
  },
};

export const universityCourseService = {
  bulkDeleteUniversityCourses: (ids: string[]) => bulkDelete("university-courses", ids),

  getUniversityCourses: async (): Promise<UniversityCourse[]> => {
    if (apiConfig.useMockData) return wait(mockUniversityCourses);

    const response = await apiRequest<ListResponse<UniversityCourseRecord>>("/university-courses");
    return response.data.map(toUniversityCourse);
  },

  searchUniversityCourses: async (
    params: CourseSearchParams,
  ): Promise<SearchPage<UniversityCourse>> => {
    if (apiConfig.useMockData) {
      return wait(
        mockSearchPage(
          mockUniversityCourses,
          params,
          (course) =>
            `${course.courseName} ${course.specialization ?? ""} ${course.universityName ?? ""}`,
          (course) => course.status,
        ),
      );
    }

    const response = await apiRequest<SearchResponse<UniversityCourseRecord>>(
      `/university-courses?${searchQuery(params)}`,
    );
    return { ...response, data: response.data.map(toUniversityCourse) };
  },

  /** Pass universityExternalId (the university's readable id); the server links it. */
  createUniversityCourse: async (
    data: Partial<UniversityCourse> & { universityExternalId?: string },
  ): Promise<UniversityCourse> => {
    if (apiConfig.useMockData) {
      return wait({ ...data, id: data.id ?? `UC-${Date.now()}` } as UniversityCourse);
    }

    const response = await apiRequest<ItemResponse<UniversityCourseRecord>>("/university-courses", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return toUniversityCourse(response.data);
  },

  updateUniversityCourse: async (
    id: string,
    data: Partial<UniversityCourse>,
  ): Promise<UniversityCourse> => {
    if (apiConfig.useMockData) {
      return wait({
        ...mockUniversityCourses.find((course) => course.id === id),
        ...data,
      } as UniversityCourse);
    }

    const response = await apiRequest<ItemResponse<UniversityCourseRecord>>(
      `/university-courses/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return toUniversityCourse(response.data);
  },
};

/** Shared search vocabulary (backend: /search-tags). Not available in mock mode. */
export const searchTagService = {
  getSearchTags: async (): Promise<SearchTag[]> => {
    if (apiConfig.useMockData) return wait([]);

    const response = await apiRequest<ListResponse<SearchTagRecord>>("/search-tags?limit=500");
    return response.data.map(toSearchTag);
  },

  createSearchTag: async (data: SearchTagInput): Promise<SearchTag> => {
    const response = await apiRequest<ItemResponse<SearchTagRecord>>("/search-tags", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return toSearchTag(response.data);
  },

  updateSearchTag: async (id: string, data: SearchTagInput): Promise<SearchTag> => {
    const response = await apiRequest<ItemResponse<SearchTagRecord>>(`/search-tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return toSearchTag(response.data);
  },

  deleteSearchTag: async (id: string): Promise<void> => {
    await apiRequest(`/search-tags/${id}`, { method: "DELETE" });
  },

  getAnalytics: async (
    scope: "courses" | "university-courses",
  ): Promise<{
    topSearches: SearchAnalyticsEntry[];
    zeroResultSearches: SearchAnalyticsEntry[];
  }> => {
    if (apiConfig.useMockData) return wait({ topSearches: [], zeroResultSearches: [] });

    const response = await apiRequest<
      ItemResponse<{
        topSearches: SearchAnalyticsEntry[];
        zeroResultSearches: SearchAnalyticsEntry[];
      }>
    >(`/search-tags/analytics?scope=${scope}&limit=8`);
    return response.data;
  },
};

export const dashboardService = {
  /** Aggregated on the server (GET /dashboard) instead of downloading every collection. */
  getDashboard: async (): Promise<DashboardData> => {
    if (apiConfig.useMockData) return wait(dashboardData);

    const response = await apiRequest<ItemResponse<DashboardData>>("/dashboard");
    return response.data;
  },
};

export const assessmentService = {
  /**
   * Assessment for one student, built from real students, universities,
   * countries and documents (mock mode returns the sample assessment).
   */
  assessStudent: async (student: Student): Promise<AssessmentResult> => {
    if (apiConfig.useMockData) return wait(mockAssessment);

    const [universities, countries, documents] = await Promise.all([
      universityService.getUniversities(),
      countryService.getCountries(),
      documentService.getDocuments(),
    ]);

    return buildAssessment(student, universities, countries, documents);
  },
};

/* =========================================================
   UNIVERSITY & COURSE EXPLORER (backend: /explorer)
   Search, filters, sorting and pagination run on the server.
========================================================= */

const requireApi = () => {
  if (apiConfig.useMockData) {
    throw new Error("The explorer needs the backend API (set VITE_USE_MOCK_DATA=false).");
  }
};

export const explorerService = {
  searchUniversities: async (query: string): Promise<SearchPage<ExplorerUniversity>> => {
    requireApi();
    return apiRequest<SearchResponse<ExplorerUniversity>>(`/explorer/universities?${query}`);
  },

  searchCourses: async (query: string): Promise<SearchPage<ExplorerCourse>> => {
    requireApi();
    return apiRequest<SearchResponse<ExplorerCourse>>(`/explorer/courses?${query}`);
  },

  getFacets: async (): Promise<ExplorerFacets> => {
    requireApi();
    return (await apiRequest<ItemResponse<ExplorerFacets>>("/explorer/facets")).data;
  },

  /** includeSource: also the uploaded Excel rows / extra columns (Universities "View"). */
  getUniversity: async (
    id: string,
    options: { includeSource?: boolean } = {},
  ): Promise<ExplorerUniversity> => {
    requireApi();
    return (
      await apiRequest<ItemResponse<ExplorerUniversity>>(
        `/explorer/universities/${encodeURIComponent(id)}${options.includeSource ? "?include=source" : ""}`,
      )
    ).data;
  },

  getCourse: async (id: string): Promise<ExplorerCourse> => {
    requireApi();
    return (
      await apiRequest<ItemResponse<ExplorerCourse>>(`/explorer/courses/${encodeURIComponent(id)}`)
    ).data;
  },

  /** Several records at once, in the given order (compare / presentation). */
  getItems: async (ids: { universities: string[]; courses: string[] }): Promise<ExplorerItems> => {
    requireApi();
    const params = new URLSearchParams();
    if (ids.universities.length) params.set("universities", ids.universities.join(","));
    if (ids.courses.length) params.set("courses", ids.courses.join(","));
    return (await apiRequest<ItemResponse<ExplorerItems>>(`/explorer/items?${params}`)).data;
  },
};
