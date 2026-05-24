import { reviewChangesCommand } from "./approve.js";
import type { ReviewOutcomeCommandOptions } from "./approve.js";

export function requestChangesCommand(
  taskId: string,
  reason: string,
  options: ReviewOutcomeCommandOptions
): void {
  reviewChangesCommand(taskId, reason, "in_progress", "changes_requested", options);
}
