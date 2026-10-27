require("dotenv").config();
if (process.env.DNS_SERVERS) {
  require("dns").setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()));
}

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { analyzeWorkbook } = require("../src/services/universityExcelImport");

const ROOT = path.resolve(__dirname, "..", "..");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const files = ["CANADA.xlsx", "USA.xlsx", "IRELAND.xlsx", "FRANCE.xlsx", "Singapore.xlsx", "LATVIA.xlsx"];

  for (const file of files) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    const { preview } = await analyzeWorkbook(buf, { mode: "skip", defaultCountry: "", fileName: file });
    const unrecognized = preview.issues.filter((issue) => issue.code === "unrecognized_sheet");
    console.log(
      file,
      "errors",
      preview.summary.errors,
      "warnings",
      preview.summary.warnings,
      "unrecognized",
      unrecognized.length,
    );
    preview.sheets.forEach((sheet) => console.log(" ", sheet.name, sheet.type));
    unrecognized.forEach((issue) => console.log("  WARN", issue.sheet, issue.message.slice(0, 80)));
  }

  await mongoose.disconnect();
})();
