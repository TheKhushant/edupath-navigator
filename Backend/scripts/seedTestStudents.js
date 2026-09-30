require("dotenv").config();

const mongoose = require("mongoose");

const Student = require("../src/models/Student");

const MONGO_URI = process.env.MONGO_URI;

// Fictional students for testing the University Matcher.
// IDs use their own "SS-TEST-" prefix so they never collide with the
// "SS-2026-xxxx" IDs the app generates. Emails use the reserved
// example.com domain. Run with --remove to delete them again.
const REMOVE = process.argv.includes("--remove");

const { testStudents } = require("./testData/students");


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
