require("dotenv").config();

const mongoose = require("mongoose");

const Student = require("../src/models/Student");
const University = require("../src/models/University");
const UniversityCourse = require("../src/models/UniversityCourse");
const Course = require("../src/models/Course");
const Country = require("../src/models/Country");
const Application = require("../src/models/Application");
const Document = require("../src/models/Document");
const VisaCase = require("../src/models/VisaCase");
const Payment = require("../src/models/Payment");
const FollowUp = require("../src/models/FollowUp");
const Notification = require("../src/models/Notification");

const FRONTEND_MOCK_DATA_PATH =
  "../../Frontend/src/data/mockData.ts";

const seedDatabase = async () => {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

    const mockData = await import(FRONTEND_MOCK_DATA_PATH);

    const {
      mockStudents,
      mockUniversities,
      mockUniversityCourses,
      mockCourses,
      mockCountries,
      mockApplications,
      mockDocuments,
      mockVisaCases,
      mockPayments,
      mockFollowUps,
      mockNotifications,
    } = mockData;

    console.log("Frontend mock data loaded.");

    // =========================================================
    // CLEAR EXISTING DATA
    // =========================================================

    console.log("");
    console.log("Clearing existing seed data...");

    await Promise.all([
      Student.deleteMany({}),
      University.deleteMany({}),
      UniversityCourse.deleteMany({}),
      Course.deleteMany({}),
      Country.deleteMany({}),
      Application.deleteMany({}),
      Document.deleteMany({}),
      VisaCase.deleteMany({}),
      Payment.deleteMany({}),
      FollowUp.deleteMany({}),
      Notification.deleteMany({}),
    ]);

    console.log("Existing data cleared.");

    // =========================================================
    // 1. STUDENTS
    // =========================================================

    console.log("");
    console.log("Seeding students...");

    const students = mockStudents.map((student) => ({
      ...student,
    }));

    const insertedStudents = await Student.insertMany(students);

    // Map:
    // SS-2026-0001 -> MongoDB ObjectId
    const studentMap = new Map(
      insertedStudents.map((student) => [
        student.id,
        student._id,
      ])
    );

    console.log(`Students inserted: ${insertedStudents.length}`);

    // =========================================================
    // 2. UNIVERSITIES
    // =========================================================

    console.log("Seeding universities...");

    const universities = mockUniversities.map((university) => ({
      ...university,
    }));

    const insertedUniversities =
      await University.insertMany(universities);

    // Map:
    // UNI-001 -> MongoDB ObjectId
    const universityMap = new Map(
      insertedUniversities.map((university) => [
        university.id,
        university._id,
      ])
    );

    console.log(
      `Universities inserted: ${insertedUniversities.length}`
    );

    // =========================================================
    // 3. COURSES
    // =========================================================

    console.log("Seeding courses...");

    const courses = mockCourses.map((course) => ({
      ...course,
    }));

    const insertedCourses = await Course.insertMany(courses);

    // Map:
    // CRS-001 -> MongoDB ObjectId
    const courseMap = new Map(
      insertedCourses.map((course) => [
        course.id,
        course._id,
      ])
    );

    console.log(`Courses inserted: ${insertedCourses.length}`);

    // =========================================================
    // 4. COUNTRIES
    // =========================================================

    console.log("Seeding countries...");

    const countries = mockCountries.map((country) => ({
      id: country.id,
      name: country.country,

      livingCostMin: country.livingCostMin,
      livingCostMax: country.livingCostMax,
      livingCostCurrency: country.livingCostCurrency,
      livingCostPeriod: country.livingCostPeriod,

      languageRequirements: country.languageRequirements,
      academicRequirements: country.academicRequirements,
      financialRequirements: country.financialRequirements,
      visaRequirements: country.visaRequirements,
      applicationProcess: country.applicationProcess,
      postStudy: country.postStudy,

      notes: country.notes,
      lastVerified: country.lastVerified,
      sourceUrl: country.sourceUrl,

      status: "Active",
    }));

    const insertedCountries =
      await Country.insertMany(countries);

    console.log(
      `Countries inserted: ${insertedCountries.length}`
    );
// =========================================================
// 5. UNIVERSITY COURSES
// =========================================================

console.log("Seeding university courses...");

const universityCourses = mockUniversityCourses.map(
  (universityCourse) => {
    const universityMongoId = universityMap.get(
      universityCourse.universityId
    );

    if (!universityMongoId) {
      throw new Error(
        `University not found for external ID: ${universityCourse.universityId}`
      );
    }

    /*
     * The frontend mock data does not consistently provide
     * courseId for UniversityCourse records.
     *
     * Resolve the backend Course using the course name.
     */
    const matchingCourse = insertedCourses.find(
      (course) =>
        course.name === universityCourse.canonicalCourse ||
        course.name === universityCourse.courseName ||
        course.name === universityCourse.course
    );

    if (!matchingCourse) {
      throw new Error(
        `Course not found for UniversityCourse: ${
          universityCourse.id
        } (${universityCourse.courseName})`
      );
    }

    return {
      ...universityCourse,

      // Actual MongoDB University reference
      universityId: universityMongoId,

      // Original frontend University ID
      universityExternalId:
        universityCourse.universityId,

      // Actual MongoDB Course reference
      courseId: matchingCourse._id,

      // Original frontend Course ID
      courseExternalId: matchingCourse.id,

      // Make sure backend required field is present
      courseName: universityCourse.courseName,
    };
  }
);

const insertedUniversityCourses =
  await UniversityCourse.insertMany(
    universityCourses
  );

console.log(
  `University courses inserted: ${insertedUniversityCourses.length}`
);
    // =========================================================
    // 6. APPLICATIONS
    // =========================================================

    console.log("Seeding applications...");

    const applications = mockApplications.map(
      (application) => {
        const studentMongoId = studentMap.get(
          application.studentId
        );

        const universityMongoId = universityMap.get(
          application.universityId
        );

        const courseMongoId = courseMap.get(
          application.courseId
        );

        return {
          id: application.id,

          studentId: studentMongoId,
          studentExternalId: application.studentId,
          studentName: application.student,

          universityId: universityMongoId,
          universityExternalId: application.universityId,
          universityName: application.university,

          courseId: courseMongoId,
          courseExternalId: application.courseId,
          courseName: application.course,

          intake: application.intake,
          status: application.status,

          applicationDate: application.applicationDate,
          deadline: application.deadline,
          submissionDate: application.submissionDate,
          submittedDate: application.submittedDate,

          offerStatus: application.offerStatus,
          offerDate: application.offerDate,
          decisionDate: application.decisionDate,

          applicationNumber:
            application.applicationNumber,

          counsellor: application.counsellor,
          notes: application.notes,
        };
      }
    );

    const insertedApplications =
      await Application.insertMany(applications);

    // Map:
    // APP-2026-001 -> MongoDB ObjectId
    const applicationMap = new Map(
      insertedApplications.map((application) => [
        application.id,
        application._id,
      ])
    );

    console.log(
      `Applications inserted: ${insertedApplications.length}`
    );

    // =========================================================
    // 7. DOCUMENTS
    // =========================================================

    console.log("Seeding documents...");

    const documents = mockDocuments.map((document) => {
      const studentMongoId = studentMap.get(
        document.studentId
      );

      const applicationMongoId =
        document.applicationId
          ? applicationMap.get(document.applicationId)
          : undefined;

      return {
        id: document.id,

        studentId: studentMongoId,
        studentExternalId: document.studentId,
        studentName: document.student,

        applicationId: applicationMongoId,
        applicationExternalId:
          document.applicationId,

        name: document.name,
        type: document.type,
        status: document.status,

        fileName: document.fileName,
        fileUrl: document.fileUrl,

        uploadedDate: document.uploadedDate,
        uploadedAt: document.uploadedAt,

        verifiedAt: document.verifiedAt,
        verifiedBy: document.verifiedBy,

        expiryDate: document.expiryDate,

        notes: document.notes,
      };
    });

    const insertedDocuments =
      await Document.insertMany(documents);

    console.log(
      `Documents inserted: ${insertedDocuments.length}`
    );

    // =========================================================
    // 8. VISA CASES
    // =========================================================

    console.log("Seeding visa cases...");

    const visaCases = mockVisaCases.map((visaCase) => {
      const studentMongoId = studentMap.get(
        visaCase.studentId
      );

      const applicationMongoId =
        visaCase.applicationId
          ? applicationMap.get(visaCase.applicationId)
          : undefined;

      return {
        id: visaCase.id,

        studentId: studentMongoId,
        studentExternalId: visaCase.studentId,
        studentName: visaCase.student,

        applicationId: applicationMongoId,
        applicationExternalId:
          visaCase.applicationId,

        country: visaCase.country,
        university: visaCase.university,
        visaType: visaCase.visaType,

        status: visaCase.status,

        applicationDate: visaCase.applicationDate,
        appointmentDate: visaCase.appointmentDate,
        biometricDate: visaCase.biometricDate,
        interviewDate: visaCase.interviewDate,
        decisionDate: visaCase.decisionDate,
        expiryDate: visaCase.expiryDate,

        documentStatus: visaCase.documentStatus,

        notes: visaCase.notes,
      };
    });

    const insertedVisaCases =
      await VisaCase.insertMany(visaCases);

    console.log(
      `Visa cases inserted: ${insertedVisaCases.length}`
    );

    // =========================================================
    // 9. PAYMENTS
    // =========================================================

    console.log("Seeding payments...");

    const payments = mockPayments.map((payment) => {
      const studentMongoId = studentMap.get(
        payment.studentId
      );

      const applicationMongoId =
        payment.applicationId
          ? applicationMap.get(payment.applicationId)
          : undefined;

      return {
        id: payment.id,

        studentId: studentMongoId,
        studentExternalId: payment.studentId,
        studentName: payment.student,

        applicationId: applicationMongoId,
        applicationExternalId:
          payment.applicationId,

        service: payment.service,
        paymentType: payment.paymentType,

        amount: Number(payment.amount) || 0,
        paidAmount: Number(payment.paidAmount) || 0,

        currency: payment.currency || "INR",

        status: payment.status,

        paymentMethod: payment.paymentMethod,
        method: payment.method,

        transactionId: payment.transactionId,

        paymentDate: payment.paymentDate,
        dueDate: payment.dueDate,

        notes: payment.notes,
      };
    });

    const insertedPayments =
      await Payment.insertMany(payments);

    console.log(
      `Payments inserted: ${insertedPayments.length}`
    );

    // =========================================================
    // 10. FOLLOW UPS
    // =========================================================

    console.log("Seeding follow ups...");

    const followUps = mockFollowUps.map((followUp) => {
      const studentMongoId = studentMap.get(
        followUp.studentId
      );

      return {
        id: followUp.id,

        studentId: studentMongoId,
        studentExternalId: followUp.studentId,
        studentName: followUp.student,

        counsellor: followUp.counsellor,

        title: followUp.title || followUp.type,
        description: followUp.description,

        type: followUp.type,

        date: followUp.date,
        time: followUp.time,
        dueDate: followUp.dueDate,

        priority: followUp.priority,
        status: followUp.status,

        completedDate: followUp.completedDate,
        assignedTo: followUp.assignedTo,

        notes: followUp.notes,
      };
    });

    const insertedFollowUps =
      await FollowUp.insertMany(followUps);

    console.log(
      `Follow ups inserted: ${insertedFollowUps.length}`
    );

    // =========================================================
    // 11. NOTIFICATIONS
    // =========================================================

    console.log("Seeding notifications...");

    const notifications = mockNotifications.map(
      (notification) => ({
        id: notification.id,

        title: notification.title,
        description: notification.description,

        category: notification.category,
        time: notification.time,
        tone: notification.tone,

        read: notification.read,

        message: notification.message,
        type: notification.type,
        priority: notification.priority,

        relatedEntity: notification.relatedEntity,
        relatedEntityId:
          notification.relatedEntityId,

        createdAtSource:
          notification.createdAtSource,
      })
    );

    const insertedNotifications =
      await Notification.insertMany(
        notifications
      );

    console.log(
      `Notifications inserted: ${insertedNotifications.length}`
    );

    // =========================================================
    // SUCCESS
    // =========================================================

    console.log("");
    console.log("======================================");
    console.log("EduPath Navigator Seed Completed");
    console.log("======================================");

    console.log(`Students:           ${insertedStudents.length}`);
    console.log(`Universities:       ${insertedUniversities.length}`);
    console.log(
      `University Courses: ${insertedUniversityCourses.length}`
    );
    console.log(`Courses:            ${insertedCourses.length}`);
    console.log(`Countries:          ${insertedCountries.length}`);
    console.log(
      `Applications:       ${insertedApplications.length}`
    );
    console.log(
      `Documents:          ${insertedDocuments.length}`
    );
    console.log(
      `Visa Cases:         ${insertedVisaCases.length}`
    );
    console.log(
      `Payments:           ${insertedPayments.length}`
    );
    console.log(
      `Follow Ups:         ${insertedFollowUps.length}`
    );
    console.log(
      `Notifications:      ${insertedNotifications.length}`
    );

    console.log("======================================");
  } catch (error) {
    console.error("");
    console.error("Seed Error:", error.message);

    if (error.errors) {
      console.error("");
      console.error("Validation Details:");

      Object.entries(error.errors).forEach(
        ([field, detail]) => {
          console.error(
            `- ${field}: ${detail.message}`
          );
        }
      );
    }

    console.error("");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
};

seedDatabase();