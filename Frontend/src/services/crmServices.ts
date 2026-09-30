import { apiConfig, apiRequest } from "@/lib/api";
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