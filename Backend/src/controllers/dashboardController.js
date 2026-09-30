const Student = require("../models/Student");
const University = require("../models/University");
const Application = require("../models/Application");
const Document = require("../models/Document");
const VisaCase = require("../models/VisaCase");
const Payment = require("../models/Payment");
const FollowUp = require("../models/FollowUp");

// Dates are stored as free-form strings ("21 Jan 2026", "2026-01-21",
// "21/01/2026"). Unparseable values are ignored rather than guessed.
function parseDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;

  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const formatShortDate = (date) => `${date.getDate()} ${MONTHS[date.getMonth()].charAt(0)}${MONTHS[date.getMonth()].slice(1).toLowerCase()}`;

const formatAmount = (amount, currency) =>
  currency === "INR"
    ? `₹${amount.toLocaleString("en-IN")}`
    : `${currency} ${amount.toLocaleString("en-IN")}`;

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const OPEN_DOCUMENT_STATUSES = ["Pending", "Uploaded", "Under Review"];
const CLOSED_APPLICATION_STATUSES = ["Submitted", "Under Review", "Offer Received", "Rejected", "Withdrawn"];
const OPEN_PAYMENT_STATUSES = ["Pending", "Partial", "Overdue"];
const OPEN_FOLLOW_UP_STATUSES = ["Pending", "Overdue"];
const CLOSED_VISA_STATUSES = ["Approved", "Rejected"];

// Student stages grouped the way the dashboard pipeline shows them
const PIPELINE = [
  { label: "Registration", stages: ["New Enquiry", "Registration"] },
  { label: "Profile Assessment", stages: ["Profile Assessment"] },
  { label: "University Shortlist", stages: ["University Shortlist"] },
  { label: "Documents", stages: ["Documents"] },
  { label: "Application", stages: ["Application"] },
  { label: "Offer · Visa · Departure", stages: ["Offer Received", "Visa", "Departure"] },
];

// GET /api/dashboard
const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalStudents,
      activeStudents,
      newEnquiries,
      profilesToReview,
      services,
      stageCounts,
      countryCounts,
      universities,
      openDocuments,
      openDocumentStudents,
      applications,
      offers,
      visaOpen,
      visaUnderReview,
      openPayments,
      openFollowUps,
      highPriorityFollowUps,
      recentStudents,
    ] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ status: "Active" }),
      Student.countDocuments({ stage: "New Enquiry" }),
      Student.countDocuments({ stage: "Profile Assessment" }),
      Student.distinct("service"),
      Student.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]),
      Student.aggregate([
        { $unwind: "$preferredCountries" },
        { $group: { _id: "$preferredCountries", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 4 },
      ]),
      University.countDocuments(),
      Document.countDocuments({ status: { $in: OPEN_DOCUMENT_STATUSES } }),
      Document.distinct("studentName", { status: { $in: OPEN_DOCUMENT_STATUSES } }),
      Application.find(
        {},
        { studentName: 1, universityName: 1, courseName: 1, status: 1, deadline: 1, updatedAt: 1 },
      ).lean(),
      Application.countDocuments({ status: "Offer Received" }),
      VisaCase.find(
        { status: { $nin: CLOSED_VISA_STATUSES } },
        { studentName: 1, country: 1, appointmentDate: 1, status: 1 },
      ).lean(),
      VisaCase.countDocuments({ status: "Under Review" }),
      Payment.find(
        { status: { $in: OPEN_PAYMENT_STATUSES } },
        { studentName: 1, amount: 1, paidAmount: 1, currency: 1, paymentType: 1, dueDate: 1, status: 1, updatedAt: 1 },
      ).lean(),
      FollowUp.find(
        { status: { $in: OPEN_FOLLOW_UP_STATUSES } },
        { studentName: 1, title: 1, type: 1, date: 1, dueDate: 1, priority: 1 },
      ).lean(),
      FollowUp.countDocuments({ status: { $in: OPEN_FOLLOW_UP_STATUSES }, priority: "High" }),
      Student.find({}, { createdAt: 1 }).lean(),
    ]);

    // ---------- Stats ----------

    const openApplications = applications.filter(
      (application) => !CLOSED_APPLICATION_STATUSES.includes(application.status),
    );

    const upcomingApplicationDeadlines = openApplications
      .map((application) => ({ application, date: parseDate(application.deadline) }))
      .filter((item) => item.date && item.date >= today)
      .sort((a, b) => a.date - b.date);

    const outstandingByCurrency = new Map();
    for (const payment of openPayments) {
      const outstanding = Math.max(0, (payment.amount ?? 0) - (payment.paidAmount ?? 0));
      const currency = payment.currency || "INR";
      outstandingByCurrency.set(currency, (outstandingByCurrency.get(currency) ?? 0) + outstanding);
    }

    const outstandingText =
      outstandingByCurrency.size === 0
        ? "Nothing outstanding"
        : `${[...outstandingByCurrency].map(([currency, amount]) => formatAmount(amount, currency)).join(" + ")} outstanding`;

    const stats = [
      {
        label: "New Enquiries",
        value: String(newEnquiries),
        detail: `${plural(totalStudents, "student")} in total`,
        tone: "brand",
      },
      {
        label: "Profiles to Review",
        value: String(profilesToReview),
        detail: "In profile assessment",
        tone: "warning",
      },
      {
        label: "Documents Pending",
        value: String(openDocuments),
        detail: `Across ${plural(openDocumentStudents.filter(Boolean).length, "student")}`,
        tone: "info",
      },
      {
        label: "App Deadlines",
        value: String(upcomingApplicationDeadlines.length),
        detail: upcomingApplicationDeadlines[0]
          ? `Next: ${formatShortDate(upcomingApplicationDeadlines[0].date)}`
          : "None upcoming",
        tone: "danger",
      },
      {
        label: "Offer Letters",
        value: String(offers),
        detail: `${plural(applications.length, "application")} in total`,
        tone: "brand",
      },
      {
        label: "Visa Cases",
        value: String(visaOpen.length),
        detail: `${visaUnderReview} under review`,
        tone: "info",
      },
      {
        label: "Payments Pending",
        value: String(openPayments.length),
        detail: outstandingText,
        tone: "warning",
      },
      {
        label: "Follow-ups Due",
        value: String(openFollowUps.length),
        detail: `${highPriorityFollowUps} high priority`,
        tone: "danger",
      },
    ];

    // ---------- Pipeline (student stages) ----------

    const countByStage = new Map(stageCounts.map((item) => [item._id, item.count]));

    const pipeline = PIPELINE.map((group) => {
      const count = group.stages.reduce((sum, stage) => sum + (countByStage.get(stage) ?? 0), 0);
      return { label: group.label, count, state: count > 0 ? "active" : "upcoming" };
    });

    // ---------- Destination mix ----------

    const maxCountry = countryCounts[0]?.count ?? 0;
    const countryMix = countryCounts.map((item) => ({
      country: item._id,
      count: item.count,
      width: `${Math.max(8, Math.round((item.count / maxCountry) * 100))}%`,
    }));

    // ---------- Upcoming deadlines (dated records only) ----------

    const deadlineItems = [
      ...upcomingApplicationDeadlines.map(({ application, date }) => ({
        date,
        title: `${application.universityName || "Application"} — deadline`,
        detail: [application.studentName, application.courseName].filter(Boolean).join(" · "),
      })),
      ...visaOpen
        .map((visa) => ({ visa, date: parseDate(visa.appointmentDate) }))
        .filter((item) => item.date && item.date >= today)
        .map(({ visa, date }) => ({
          date,
          title: "Visa appointment",
          detail: [visa.studentName, visa.country].filter(Boolean).join(" · "),
        })),
      ...openPayments
        .map((payment) => ({ payment, date: parseDate(payment.dueDate) }))
        .filter((item) => item.date && item.date >= today)
        .map(({ payment, date }) => ({
          date,
          title: `${payment.paymentType || "Payment"} due`,
          detail: payment.studentName || "",
        })),
      ...openFollowUps
        .map((followUp) => ({ followUp, date: parseDate(followUp.dueDate || followUp.date) }))
        .filter((item) => item.date && item.date >= today)
        .map(({ followUp, date }) => ({
          date,
          title: followUp.title || followUp.type || "Follow-up",
          detail: followUp.studentName || "",
        })),
    ]
      .sort((a, b) => a.date - b.date)
      .slice(0, 3)
      .map((item) => {
        const days = Math.round((item.date - today) / 86400000);
        return {
          date: String(item.date.getDate()),
          month: MONTHS[item.date.getMonth()],
          title: item.title,
          detail: item.detail,
          tone: days <= 7 ? "danger" : days <= 14 ? "warning" : "info",
        };
      });

    // ---------- Recent activity (latest updated records) ----------

    const activities = [
      ...applications.map((application) => ({
        at: application.updatedAt,
        title: `Application ${String(application.status || "updated").toLowerCase()}`,
        detail: [application.studentName, application.universityName].filter(Boolean).join(" — "),
        tone: application.status === "Offer Received" ? "success" : "brand",
      })),
      ...openPayments.map((payment) => ({
        at: payment.updatedAt,
        title: `Payment ${String(payment.status).toLowerCase()}`,
        detail: [payment.paymentType, payment.studentName].filter(Boolean).join(" — "),
        tone: "warning",
      })),
    ]
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 3)
      .map(({ title, detail, tone }) => ({ title, detail, tone }));

    // ---------- Enquiry trend: new students per week, last 12 weeks ----------

    const weekMs = 7 * 86400000;
    const start = today.getTime() - 11 * weekMs;
    const weekly = Array.from({ length: 12 }, () => 0);

    for (const student of recentStudents) {
      const created = new Date(student.createdAt).getTime();
      if (created >= start) {
        const index = Math.min(11, Math.floor((created - start) / weekMs));
        weekly[index]++;
      }
    }

    const maxWeek = Math.max(...weekly);
    const enquiryTrend = weekly.map((count, index) => ({
      label: `W${index + 1}`,
      count,
      height: String(maxWeek ? Math.round((count / maxWeek) * 100) : 0),
    }));

    res.status(200).json({
      success: true,
      data: {
        stats,
        pipeline,
        countryMix,
        deadlines: deadlineItems,
        activities,
        enquiryTrend,
        reports: {
          activeStudents,
          services: services.filter(Boolean).length,
          applications: applications.length,
          offers,
          outstanding: [...outstandingByCurrency].map(([currency, amount]) => ({ currency, amount })),
        },
        universities,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
      error: error.message,
    });
  }
};

module.exports = { getDashboard };
