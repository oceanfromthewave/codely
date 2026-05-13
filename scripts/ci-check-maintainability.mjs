import fs from 'node:fs';

const reportPath = process.argv[2] ?? 'report.json';
const raw = fs.readFileSync(reportPath, 'utf8');
const data = JSON.parse(raw);
const m = data.averageMaintainability;
if (typeof m !== 'number' || Number.isNaN(m)) {
  console.error(`Invalid or missing averageMaintainability in ${reportPath}`);
  process.exit(1);
}
const threshold = Number(process.env.CODELY_MIN_MAINTAINABILITY ?? '5');
if (m < threshold) {
  console.error(`Project maintainability ${m} is below threshold ${threshold}`);
  process.exit(1);
}
console.log(`Maintainability OK: ${m} (threshold ${threshold})`);
