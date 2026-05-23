import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { validateTasks } from "../src/specs/validateTasks.js";
import type { LoadedTask } from "../src/specs/schema.js";

function makeTask(overrides: Partial<LoadedTask["spec"]> = {}): LoadedTask {
  return {
    filePath: `/fake/${overrides.id ?? "test-task"}.yaml`,
    spec: {
      id: "test-task",
      title: "Test Task",
      status: "pending",
      type: "implementation",
      domain: "core",
      priority: "medium",
      depends_on: [],
      allowed_paths: ["src/**"],
      forbidden_paths: ["src/auth/**"],
      goal: "Do something.",
      acceptance_criteria: ["It works."],
      verification: { commands: ["pnpm test"] },
      outputs_required: ["files_changed"],
      notes: ["Keep it simple."],
      ...overrides,
    },
  };
}

describe("validateTasks", () => {
  it("returns valid tasks with no issues", () => {
    const tasks = [makeTask(), makeTask({ id: "other-task", title: "Other" })];
    const { valid, invalid, warnings } = validateTasks(tasks);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("reports duplicate task ids", () => {
    const tasks = [
      makeTask({ id: "dup" }),
      { filePath: "/fake/dup-2.yaml", spec: { ...makeTask({ id: "dup" }).spec } },
    ];
    const { invalid } = validateTasks(tasks);
    // The second file with a duplicate id should be flagged
    const dupError = invalid.find((i) =>
      i.errors.some((e) => e.message.includes("Duplicate"))
    );
    expect(dupError).toBeDefined();
  });

  it("reports missing dependency", () => {
    const tasks = [makeTask({ id: "child", depends_on: ["missing-parent"] })];
    const { invalid } = validateTasks(tasks);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].errors[0].message).toContain("missing-parent");
  });

  it("passes when dependency exists", () => {
    const tasks = [
      makeTask({ id: "parent" }),
      makeTask({ id: "child", depends_on: ["parent"] }),
    ];
    const { valid, invalid } = validateTasks(tasks);
    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(2);
  });

  it("reports missing domain references when a domains directory is provided", () => {
    const domainsDir = mkdtempSync(join(tmpdir(), "assignr-domains-"));
    const tasks = [makeTask({ id: "child", domain: "missing-domain" })];

    try {
      const { invalid } = validateTasks(tasks, { specsDomainsDir: domainsDir });

      expect(invalid).toHaveLength(1);
      expect(invalid[0].errors[0].field).toBe("domain");
      expect(invalid[0].errors[0].message).toContain("child");
      expect(invalid[0].errors[0].message).toContain("missing-domain");
    } finally {
      rmSync(domainsDir, { recursive: true, force: true });
    }
  });

  it("passes when domain references resolve", () => {
    const domainsDir = mkdtempSync(join(tmpdir(), "assignr-domains-"));
    writeFileSync(join(domainsDir, "core.yaml"), "id: core\n");

    try {
      const { valid, invalid } = validateTasks([makeTask()], { specsDomainsDir: domainsDir });

      expect(invalid).toHaveLength(0);
      expect(valid).toHaveLength(1);
    } finally {
      rmSync(domainsDir, { recursive: true, force: true });
    }
  });

  it("warns about empty optional fields (not depends_on)", () => {
    const tasks = [
      makeTask({
        allowed_paths: [],
        forbidden_paths: [],
        outputs_required: [],
        notes: [],
      }),
    ];
    const { warnings } = validateTasks(tasks);
    expect(warnings.length).toBeGreaterThan(0);
    const fields = warnings.map((w) => w.field);
    expect(fields).toContain("allowed_paths");
    expect(fields).toContain("forbidden_paths");
    expect(fields).toContain("outputs_required");
    expect(fields).toContain("notes");
    // depends_on is not warned about — having no dependencies is valid.
    expect(fields).not.toContain("depends_on");
  });
});
