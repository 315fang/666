const {
  readContext,
  buildResultReport,
  writeResultArtifacts
} = require('./cloudbase-import-kit');

function main() {
  const report = buildResultReport(readContext());
  writeResultArtifacts(report);
  console.log(JSON.stringify(report, null, 2));
}

main();
