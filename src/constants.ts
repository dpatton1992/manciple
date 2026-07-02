export const DEFAULT_ROOT = ".manciple";

export const STATUSES = [
  "pending",
  "in_progress",
  "needs_review",
  "complete",
  "blocked",
  "failed",
  "partial",
  "archived",
] as const;

export const TASK_TYPES = [
  "planning",
  "implementation",
  "review",
  "test",
  "refactor",
  "docs",
  "research",
  "hardening",
] as const;

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type Status = (typeof STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
