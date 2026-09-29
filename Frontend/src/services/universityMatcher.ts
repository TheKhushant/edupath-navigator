import {
  mockCountries,
  mockUniversities,
  mockUniversityCourses,
} from "@/data/mockData";

import type {
  Student,
  UniversityMatch,
} from "@/types/crm";

export const matchUniversities = (
  student: Student
): UniversityMatch[] => {
  const results: UniversityMatch[] = [];

  const studentBudget = Number(
    student.budget.replace(/[^\d]/g, "")
  );

  const preferredCountries =
    student.preferredCountries.map((country) =>
      country.toLowerCase().trim()
    );

  const studentCourse =
    `${student.desiredCourse ?? ""} ${
      student.specialization ?? ""
    }`.toLowerCase();

  const studentSpecialization =
    student.specialization?.trim().toLowerCase() ?? "";

  for (const universityCourse of mockUniversityCourses) {
    const university = mockUniversities.find(
      (item) => item.id === universityCourse.universityId
    );

    if (!university) continue;

    const country = mockCountries.find(
      (item) =>
        item.country.toLowerCase() ===
        university.country.toLowerCase()
    );

    if (!country) continue;

    const matchedCriteria: string[] = [];
    const warnings: string[] = [];
    const missingRequirements: string[] = [];

    // -----------------------------------
    // COUNTRY MATCH
    // -----------------------------------

    const countryMatched = preferredCountries.includes(
      university.country.toLowerCase()
    );

    if (countryMatched) {
      matchedCriteria.push("Preferred country");
    }

    // -----------------------------------
    // COURSE MATCH
    // -----------------------------------

    const courseMatched =
      studentCourse.includes(
        universityCourse.canonicalCourse.toLowerCase()
      ) ||
      universityCourse.aliases.some((alias: string) =>
        studentCourse.includes(alias.toLowerCase())
      ) ||
      (
        studentSpecialization.length > 0 &&
        universityCourse.specialization
          .toLowerCase()
          .includes(studentSpecialization)
      );

    if (courseMatched) {
      matchedCriteria.push("Course / specialization");
    }

    // -----------------------------------
    // IELTS
    // -----------------------------------

    if (
      student.ielts &&
      universityCourse.ielts
    ) {
      matchedCriteria.push(
        "English language requirement available"
      );
    }

    // -----------------------------------
    // ACADEMIC
    // -----------------------------------

    if (student.cgpa) {
      matchedCriteria.push(
        "Academic profile available for review"
      );
    }

    // -----------------------------------
    // BUDGET
    // -----------------------------------

    if (studentBudget > 0) {
      matchedCriteria.push(
        "Budget available for comparison"
      );
    }

    // -----------------------------------
    // WARNINGS
    // -----------------------------------

    if (!countryMatched) {
      warnings.push(
        "Country is outside student's preferred countries"
      );
    }

    if (!courseMatched) {
      warnings.push(
        "Course match needs counsellor review"
      );
    }

    // -----------------------------------
    // STATUS
    // -----------------------------------

    const status: UniversityMatch["status"] =
      courseMatched && countryMatched
        ? "Matching"
        : "Review Required";

    // -----------------------------------
    // ACTION
    // -----------------------------------

    const action: UniversityMatch["action"] =
      status === "Matching"
        ? "Shortlist"
        : "Review";

    // -----------------------------------
    // RESULT
    // -----------------------------------

    results.push({
      universityId: university.id,
      university: university.name,

      countryId: country.id,
      country: country.country,

      courseId: universityCourse.id,
      course: universityCourse.courseName,

      canonicalCourse:
        universityCourse.canonicalCourse,

      difficulty:
        universityCourse.difficulty,

      tuitionMin:
        universityCourse.tuitionMin,

      tuitionMax:
        universityCourse.tuitionMax,

      tuitionCurrency:
        universityCourse.tuitionCurrency,

      tuitionPeriod:
        universityCourse.tuitionPeriod,

      livingCostMin:
        country.livingCostMin,

      livingCostMax:
        country.livingCostMax,

      livingCostCurrency:
        country.livingCostCurrency,

      livingCostPeriod:
        country.livingCostPeriod,

      intake:
        universityCourse.intake,

      applicationStartDate:
        universityCourse.applicationStartDate,

      applicationDeadline:
        universityCourse.applicationDeadline,

      lastVerified:
        universityCourse.lastVerified,

      matchedCriteria,

      warnings,

      missingRequirements,

      status,

      action,
    });
  }

  return results;
};