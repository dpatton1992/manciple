import { reviewChangesCommand } from "./approve.js";
import type { ReviewOutcomeCommandOptions } from "./approve.js";

export function blockReviewCommand(
  taskId: string,
  reason: string,
  options: ReviewOutcomeCommandOptions
): void {
  reviewChangesCommand(taskId, reason, "blocked", "blocked", options);
}
