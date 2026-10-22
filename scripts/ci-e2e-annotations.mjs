import { readFileSync } from 'node:fs';
import process from 'node:process';

let report;
try {
  report = JSON.parse(readFileSync('test-results/results.json', 'utf8'));
} catch {
  process.exit(0);
}

function escape(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function reportSuite(suite) {
  for (const spec of suite.specs ?? []) {
    if (spec.ok) continue;
    for (const test of spec.tests ?? []) {
      if (test.status === test.expectedStatus) continue;
      const errors = test.results.flatMap(result => result.errors ?? []);
      const message = errors.map(error => error.message ?? error.stack ?? String(error)).join('\n').slice(0, 3000);
      process.stdout.write(`::error file=${escape(spec.file)},line=${spec.line},title=${escape(spec.title)}::${escape(message || test.status)}\n`);
    }
  }
  for (const child of suite.suites ?? []) reportSuite(child);
}

for (const suite of report.suites ?? []) reportSuite(suite);
