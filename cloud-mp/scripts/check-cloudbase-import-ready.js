const {
  readContext,
  buildReadinessReport,
  writeReadinessArtifacts
} = require('./cloudbase-import-kit');

function main() {
  const report = buildReadinessReport(readContext());
  writeReadinessArtifacts(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main();
