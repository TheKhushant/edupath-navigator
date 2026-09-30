import { apiConfig, apiDownload, apiRequest } from "@/lib/api";
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
  ExcelImportOptions,
  ExcelImportPreview,
  ExcelImportResult,
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
  VisaCase,
} from "@/types/crm";

const clone = <T>(value: T): T => structuredClone(value);
const wait = async <T>(value: T): Promise<T> => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  return clone(value);
};
export const universityService = {
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

  getUniversityById: async (
    id: string,
  ): Promise<University | undefined> => {
    if (apiConfig.useMockData) {
      return wait(
        mockUniversities.find(
          (university) => university.id === id,
        ),
      );
    }

    const response = await apiRequest<{
      success: boolean;
      data: University;
    }>(`/universities/${id}`);

    return response.data;
  },

  createUniversity: async (
    data: University,
  ): Promise<University> => {
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

  updateUniversity: async (
    id: string,
    data: Partial<University>,
  ): Promise<University> => {
    if (apiConfig.useMockData) {
      return wait({
        ...mockUniversities.find(
          (university) => university.id === id,
        ),
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

  deleteUniversity: async (
    id: string,
  ): Promise<University> => {
    if (apiConfig.useMockData) {
      return wait(
        mockUniversities.find(
          (university) => university.id === id,
        ) as University,
      );
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

/* The workbook is sent as the raw request body; options go in the query string. */
const importQuery = (file: File, options: ExcelImportOptions, extra: Record<string, string> = {}) =>
  new URLSearchParams({
    fileName: file.name,
    mode: options.mode,
    defaultCountry: options.defaultCountry,
    ...extra,
  }).toString();

const requireBackend = () => {
  if (apiConfig.useMockData) {
    throw new Error("Excel import needs the backend. Set VITE_USE_MOCK_DATA=false.");
  }
};

export const universityImportService = {
  downloadTemplate: async (): Promise<Blob> => {
    requireBackend();
    return apiDownload("/universities/import/template");
  },

  /** Scans and validates the workbook. Does not modify the database. */
  previewImport: async (file: File, options: ExcelImportOptions): Promise<ExcelImportPreview> => {
    requireBackend();

    const response = await apiRequest<{ success: boolean; data: ExcelImportPreview }>(
      `/universities/import/preview?${importQuery(file, options)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      },
    );

    return response.data;
  },

  /** Re-validates the same file on the server and imports the valid rows. */
  confirmImport: async (
    file: File,
    options: ExcelImportOptions & { expectedHash: string; confirmOverwrite: boolean },
  ): Promise<ExcelImportResult> => {
    requireBackend();

    const response = await apiRequest<{ success: boolean; data: ExcelImportResult }>(
      `/universities/import/confirm?${importQuery(file, options, {
        expectedHash: options.expectedHash,
        confirmOverwrite: String(options.confirmOverwrite),
      })}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      },
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

  updateStudent: async (
    id: string,
    data: Partial<Student>,
  ): Promise<Student> => {
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