// ======================================================
// Builds data/import-template.xlsx (served by "Download Template") from a
// real import workbook: same sheet name, headers, column order and widths,
// header row only (no data, no other sheets).
//
//   npm run template:build -- --from data/Germany_testing_filled.xlsx
//   npm run template:build -- --from <file.xlsx> --out <template.xlsx>
// ======================================================

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { templateStructure, writeTemplate } = require("../src/services/universityExcelImport");

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
};

const from = option("from");
const out = path.resolve(option("out") || path.join(__dirname, "..", "data", "import-template.xlsx"));

if (!from) {
  console.error("Usage: npm run template:build -- --from <workbook.xlsx> [--out <template.xlsx>]");
  process.exit(1);
}

const structure = templateStructure(XLSX.readFile(path.resolve(from), { sheetRows: 20, cellStyles: true }));
fs.writeFileSync(out, writeTemplate(structure));

console.log(`Template written to ${out}`);
console.log(`Sheet "${structure.sheetName}", ${structure.headers.length} columns:`);
console.log(structure.headers.map((header, index) => `  ${XLSX.utils.encode_col(index)}: ${JSON.stringify(header)}`).join("\n"));
