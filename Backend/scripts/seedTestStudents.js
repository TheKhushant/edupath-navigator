require("dotenv").config();

const mongoose = require("mongoose");

const Student = require("../src/models/Student");

const MONGO_URI = process.env.MONGO_URI;

// Fictional students for testing the University Matcher.
// IDs use their own "SS-TEST-" prefix so they never collide with the
// "SS-2026-xxxx" IDs the app generates. Emails use the reserved
// example.com domain. Run with --remove to delete them again.
const REMOVE = process.argv.includes("--remove");

const testStudents = [
  // Expected: Meets Published Requirements (EUR budget, % score, IELTS above 6.5, October intake)
  {
    id: "SS-TEST-0001",
    name: "Aarav Mehta",
    initials: "AM",
    email: "aarav.mehta.test@example.com",
    mobile: "+91 90000 00101",
    qualification: "B.Tech",
    branch: "Computer Science & Engineering",
    cgpa: "84%",
    graduationYear: 2025,
    desiredCourse: "MS",
    specialization: "Computer Science",
    preferredCountries: ["Germany"],
    intake: "October 2026",
    budget: "EUR 3,000",
    ielts: "7.5",
    counsellor: "Manisha",
    stage: "University Shortlist",
    lastFollowUp: "22 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Pune",
  },

  // Expected: Matching (CGPA on 10-point scale and INR budget need manual review)
  {
    id: "SS-TEST-0002",
    name: "Diya Kulkarni",
    initials: "DK",
    email: "diya.kulkarni.test@example.com",
    mobile: "+91 90000 00102",
    qualification: "B.Tech",
    branch: "Information Technology",
    cgpa: "8.6",
    graduationYear: 2025,
    desiredCourse: "MSc",
    specialization: "Data Science",
    preferredCountries: ["Germany", "Netherlands"],
    intake: "October 2026",
    budget: "₹20,00,000",
    ielts: "7.0",
    counsellor: "Ravi",
    stage: "Profile Assessment",
    lastFollowUp: "21 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Nagpur",
  },

  // Expected: Requirement Review Needed (IELTS 6.0 below the published 6.5)
  {
    id: "SS-TEST-0003",
    name: "Rohan Iyer",
    initials: "RI",
    email: "rohan.iyer.test@example.com",
    mobile: "+91 90000 00103",
    qualification: "B.E.",
    branch: "Mechanical Engineering",
    cgpa: "72%",
    graduationYear: 2024,
    desiredCourse: "MS",
    specialization: "Mechanical Engineering",
    preferredCountries: ["Germany"],
    intake: "April 2027",
    budget: "EUR 1,500",
    ielts: "6.0",
    counsellor: "Manisha",
    stage: "Profile Assessment",
    lastFollowUp: "20 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Chennai",
  },

  // Expected: mixed - meets 65-75% universities, falls short of 75%+ ones
  {
    id: "SS-TEST-0004",
    name: "Sneha Reddy",
    initials: "SR",
    email: "sneha.reddy.test@example.com",
    mobile: "+91 90000 00104",
    qualification: "B.Pharm",
    branch: "Pharmaceutical Sciences",
    cgpa: "68%",
    graduationYear: 2025,
    desiredCourse: "MSc",
    specialization: "Biotechnology",
    preferredCountries: ["Germany"],
    intake: "October 2026",
    budget: "EUR 1,000",
    ielts: "6.5",
    counsellor: "Priyanka",
    stage: "University Shortlist",
    lastFollowUp: "19 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Hyderabad",
  },

  // Expected: MBA matches incl. private schools; EUR 20,000 budget covers some private tuition
  {
    id: "SS-TEST-0005",
    name: "Kabir Singh",
    initials: "KS",
    email: "kabir.singh.test@example.com",
    mobile: "+91 90000 00105",
    qualification: "BBA",
    branch: "Marketing",
    cgpa: "76%",
    graduationYear: 2023,
    desiredCourse: "MBA",
    specialization: "Business Analytics",
    preferredCountries: ["Germany"],
    intake: "April 2027",
    budget: "EUR 20,000",
    ielts: "7.0",
    counsellor: "Ravi",
    stage: "Documents",
    lastFollowUp: "18 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Delhi",
  },

  // Expected: Matching with IELTS listed as a missing requirement (no IELTS yet)
  {
    id: "SS-TEST-0006",
    name: "Ananya Deshpande",
    initials: "AD",
    email: "ananya.deshpande.test@example.com",
    mobile: "+91 90000 00106",
    qualification: "B.Sc",
    branch: "Physics",
    cgpa: "81%",
    graduationYear: 2026,
    desiredCourse: "MSc",
    specialization: "Physics",
    preferredCountries: ["Germany"],
    intake: "October 2026",
    budget: "EUR 2,500",
    counsellor: "Priyanka",
    stage: "New Enquiry",
    lastFollowUp: "23 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Nashik",
  },

  // Expected: Requirement Review Needed (62% below most recommendations) + intake warning
  {
    id: "SS-TEST-0007",
    name: "Vihaan Joshi",
    initials: "VJ",
    email: "vihaan.joshi.test@example.com",
    mobile: "+91 90000 00107",
    qualification: "B.Tech",
    branch: "Electronics & Communication",
    cgpa: "62%",
    graduationYear: 2025,
    desiredCourse: "MS",
    specialization: "Electrical Engineering",
    preferredCountries: ["Germany"],
    intake: "September 2026",
    budget: "EUR 2,000",
    ielts: "6.5",
    counsellor: "Manisha",
    stage: "Profile Assessment",
    lastFollowUp: "17 Sep 2026",
    status: "On Hold",
    service: "Study Abroad",
    city: "Indore",
  },

  // Expected: strong academics, but a very low EUR budget -> tuition above budget warnings
  {
    id: "SS-TEST-0008",
    name: "Ishita Nair",
    initials: "IN",
    email: "ishita.nair.test@example.com",
    mobile: "+91 90000 00108",
    qualification: "B.Tech",
    branch: "Artificial Intelligence & Data Science",
    cgpa: "88%",
    graduationYear: 2026,
    desiredCourse: "MS",
    specialization: "Artificial Intelligence",
    preferredCountries: ["Germany", "Ireland"],
    intake: "October 2026",
    budget: "EUR 500",
    ielts: "8.0",
    counsellor: "Ravi",
    stage: "University Shortlist",
    lastFollowUp: "22 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Kochi",
  },

  // Expected: Review Required (course matches, but Germany is not a preferred country)
  {
    id: "SS-TEST-0009",
    name: "Arjun Patil",
    initials: "AP",
    email: "arjun.patil.test@example.com",
    mobile: "+91 90000 00109",
    qualification: "B.Com",
    branch: "Accounting & Finance",
    cgpa: "70%",
    graduationYear: 2023,
    desiredCourse: "MSc",
    specialization: "Finance",
    preferredCountries: ["UK", "Australia"],
    intake: "October 2026",
    budget: "₹30,00,000",
    ielts: "7.0",
    counsellor: "Priyanka",
    stage: "New Enquiry",
    lastFollowUp: "16 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Kolhapur",
  },

  // Expected: niche course (Psychology / Cognitive Science) -> small match set
  {
    id: "SS-TEST-0010",
    name: "Meera Pillai",
    initials: "MP",
    email: "meera.pillai.test@example.com",
    mobile: "+91 90000 00110",
    qualification: "B.A.",
    branch: "Psychology",
    cgpa: "79%",
    graduationYear: 2025,
    desiredCourse: "MSc",
    specialization: "Psychology & Cognitive Science",
    preferredCountries: ["Germany"],
    intake: "April 2027",
    budget: "EUR 1,500",
    ielts: "7.0",
    counsellor: "Manisha",
    stage: "Profile Assessment",
    lastFollowUp: "21 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Thiruvananthapuram",
  },

  // Expected: Architecture matches only a few universities; INR budget not compared
  {
    id: "SS-TEST-0011",
    name: "Siddharth Rao",
    initials: "SR",
    email: "siddharth.rao.test@example.com",
    mobile: "+91 90000 00111",
    qualification: "B.Arch",
    branch: "Architecture",
    cgpa: "74%",
    graduationYear: 2024,
    desiredCourse: "MSc",
    specialization: "Architecture",
    preferredCountries: ["Germany"],
    intake: "October 2026",
    budget: "₹12,00,000",
    ielts: "6.5",
    counsellor: "Ravi",
    stage: "Application",
    lastFollowUp: "15 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Bengaluru",
  },

  // Expected: matches generic "Engineering" listings; February intake is not a Germany intake
  {
    id: "SS-TEST-0012",
    name: "Tanvi Shah",
    initials: "TS",
    email: "tanvi.shah.test@example.com",
    mobile: "+91 90000 00112",
    qualification: "B.Tech",
    branch: "Civil Engineering",
    cgpa: "65%",
    graduationYear: 2024,
    desiredCourse: "MS",
    specialization: "Structural Engineering",
    preferredCountries: ["Germany"],
    intake: "February 2027",
    budget: "EUR 3,000",
    ielts: "6.5",
    counsellor: "Priyanka",
    stage: "Profile Assessment",
    lastFollowUp: "20 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Ahmedabad",
  },

  // Expected: no universities found (Ausbildung / culinary is not in Sheet2 courses)
  {
    id: "SS-TEST-0013",
    name: "Nikhil Verma",
    initials: "NV",
    email: "nikhil.verma.test@example.com",
    mobile: "+91 90000 00113",
    qualification: "12th (Science)",
    branch: "PCM",
    cgpa: "71%",
    graduationYear: 2026,
    desiredCourse: "Ausbildung",
    specialization: "Culinary Arts",
    preferredCountries: ["Germany"],
    intake: "October 2026",
    budget: "₹6,00,000",
    german: "A2",
    counsellor: "Manisha",
    stage: "New Enquiry",
    lastFollowUp: "23 Sep 2026",
    status: "Active",
    service: "Germany Ausbildung",
    city: "Lucknow",
  },

  // Expected: Review Required (Health Sciences matches, but prefers Japan)
  {
    id: "SS-TEST-0014",
    name: "Priya Menon",
    initials: "PM",
    email: "priya.menon.test@example.com",
    mobile: "+91 90000 00114",
    qualification: "B.Sc",
    branch: "Nursing",
    cgpa: "77%",
    graduationYear: 2025,
    desiredCourse: "MSc",
    specialization: "Health Sciences",
    preferredCountries: ["Japan"],
    intake: "April 2027",
    budget: "₹15,00,000",
    ielts: "6.5",
    japanese: "N4",
    counsellor: "Ravi",
    stage: "Profile Assessment",
    lastFollowUp: "18 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Mangaluru",
  },

  // Expected: incomplete profile - no course, score or IELTS, so everything needs review
  {
    id: "SS-TEST-0015",
    name: "Harsh Agarwal",
    initials: "HA",
    email: "harsh.agarwal.test@example.com",
    mobile: "+91 90000 00115",
    qualification: "B.Sc",
    branch: "Mathematics",
    cgpa: "",
    graduationYear: 2026,
    desiredCourse: "",
    specialization: "",
    preferredCountries: ["Germany"],
    intake: "To be confirmed",
    budget: "",
    counsellor: "Priyanka",
    stage: "New Enquiry",
    lastFollowUp: "24 Sep 2026",
    status: "Active",
    service: "Study Abroad",
    city: "Jaipur",
  },
];


async function seedTestStudents() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is missing in .env");
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected.");

    const ids = testStudents.map((student) => student.id);

    if (REMOVE) {
      const result = await Student.deleteMany({ id: { $in: ids } });

      console.log(`Test students removed: ${result.deletedCount}`);
      return;
    }

    // Refuse to reuse an email that belongs to a non-test student
    const emails = testStudents.map((student) => student.email);

    const clashes = await Student.find({
      email: { $in: emails },
      id: { $nin: ids },
    }).lean();

    if (clashes.length > 0) {
      throw new Error(
        `Emails already used by other students: ${clashes.map((student) => student.email).join(", ")}`,
      );
    }

    let created = 0;
    let updated = 0;

    for (const student of testStudents) {
      const result = await Student.updateOne(
        { id: student.id },
        { $set: student },
        { upsert: true, runValidators: true },
      );

      if (result.upsertedCount) created++;
      else updated++;
    }

    console.log(`Test students created: ${created}`);
    console.log(`Test students updated: ${updated}`);
    console.log(`Total test students: ${testStudents.length}`);
  } catch (error) {
    console.error("TEST STUDENT SEED ERROR:", error);

    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();

      console.log("MongoDB connection closed.");
    }
  }
}


seedTestStudents();
