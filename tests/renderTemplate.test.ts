import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  IMPLEMENTATION_TEMPLATE,
  REVIEW_TEMPLATE,
} from "../src/templates/renderTemplate.js";
import type { TaskSpec } from "../src/specs/schema.js";

const spec: TaskSpec = {
  id: "license-expiration-reminders",
  title: "License expiration reminders",
  status: "pending",
  type: "implementation",
  domain: "credentialing",
  priority: "high",
  depends_on: ["license-data-model"],
  allowed_paths: ["src/features/licenses/**"],
  forbidden_paths: ["src/auth/**"],
  goal: "Add expiration reminder support for provider licenses.",
  acceptance_criteria: [
    "Users can set an expiration date.",
    "Expiring licenses appear in dashboard.",
  ],
  verification: {
    commands: ["pnpm typecheck", "pnpm test -- licenses"],
  },
  outputs_required: ["files_changed", "tests_run"],
  notes: ["Keep implementation narrow."],
};

describe("renderTemplate", () => {
  it("replaces title placeholder", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("License expiration reminders");
  });

  it("replaces id placeholder", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("license-expiration-reminders");
  });

  it("replaces goal placeholder", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("Add expiration reminder support for provider licenses.");
  });

  it("replaces acceptance_criteria placeholder", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("Users can set an expiration date.");
    expect(out).toContain("Expiring licenses appear in dashboard.");
  });

  it("renders verification commands as code blocks", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("```bash");
    expect(out).toContain("pnpm typecheck");
  });

  it("renders allowed and forbidden paths", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("src/features/licenses/**");
    expect(out).toContain("src/auth/**");
  });

  it("renders depends_on", () => {
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(out).toContain("license-data-model");
  });

  it("is deterministic across multiple calls", () => {
    const a = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    const b = renderTemplate(IMPLEMENTATION_TEMPLATE, spec);
    expect(a).toBe(b);
  });

  it("renders review template with correct heading", () => {
    const out = renderTemplate(REVIEW_TEMPLATE, spec);
    expect(out).toContain("# Review Task:");
    expect(out).toContain("License expiration reminders");
  });

  it("renders 'None specified.' for empty optional arrays", () => {
    const minSpec: TaskSpec = {
      ...spec,
      depends_on: [],
      notes: [],
      outputs_required: [],
    };
    const out = renderTemplate(IMPLEMENTATION_TEMPLATE, minSpec);
    expect(out).toContain("_None specified._");
  });
});
