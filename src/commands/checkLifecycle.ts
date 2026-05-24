import { checkLifecyclePlacement } from "../lifecycle/placement.js";

export interface CheckLifecycleCommandOptions {
  cwd: string;
  activeDir: string;
  completedDir: string;
  archivedDir: string;
}

export function checkLifecycleCommand(options: CheckLifecycleCommandOptions): void {
  const result = checkLifecyclePlacement(options);

  if (result.ok) {
    console.log(`Lifecycle placement OK: checked ${result.checked_count} task file(s).`);
    return;
  }

  console.error(`Lifecycle placement issues: ${result.issue_count}`);
  for (const issue of result.issues) {
    console.error(`- ${issue.file}`);
    console.error(`  tier: ${issue.tier}`);
    console.error(`  status: ${issue.status}`);
    console.error(`  ${issue.message}`);
  }

  process.exit(1);
}
