import type { LoadedTask } from "./schema.js";

export interface ValidationIssue {
  filePath: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: LoadedTask[];
  invalid: Array<{ filePath: string; errors: ValidationIssue[] }>;
  warnings: ValidationIssue[];
}

// depends_on is intentionally excluded — an empty dependency list is valid.
const OPTIONAL_FIELDS = [
  "allowed_paths",
  "forbidden_paths",
  "outputs_required",
  "notes",
] as const;

export function validateTasks(tasks: LoadedTask[]): ValidationResult {
  const warnings: ValidationIssue[] = [];
  const errorsByFile = new Map<string, ValidationIssue[]>();
  let hasMissingDependencyError = false;

  // Check for duplicate IDs
  const idMap = new Map<string, string[]>();
  for (const { spec, filePath } of tasks) {
    const existing = idMap.get(spec.id) ?? [];
    idMap.set(spec.id, [...existing, filePath]);
  }

  // Build set of all task IDs for dependency checking
  const allIds = new Set(tasks.map((t) => t.spec.id));
  const taskById = new Map(tasks.map((t) => [t.spec.id, t]));

  function addError(filePath: string, issue: ValidationIssue): void {
    const errors = errorsByFile.get(filePath) ?? [];
    errors.push(issue);
    errorsByFile.set(filePath, errors);
  }

  for (const loaded of tasks) {
    const { spec, filePath } = loaded;

    // Check for duplicate IDs
    const duplicates = idMap.get(spec.id) ?? [];
    if (duplicates.length > 1 && duplicates[0] !== filePath) {
      addError(filePath, {
        filePath,
        field: "id",
        message: `Duplicate task id "${spec.id}" also found in ${duplicates[0]}`,
        severity: "error",
      });
    }

    // Check dependency references
    for (const dep of spec.depends_on ?? []) {
      if (!allIds.has(dep)) {
        hasMissingDependencyError = true;
        addError(filePath, {
          filePath,
          field: "depends_on",
          message: `Task "${spec.id}" depends on missing task "${dep}"`,
          severity: "error",
        });
      }
    }

    // Warn about missing optional fields
    for (const field of OPTIONAL_FIELDS) {
      const value = spec[field];
      if (!value || (Array.isArray(value) && value.length === 0)) {
        warnings.push({
          filePath,
          field,
          message: `Optional field "${field}" is empty or missing`,
          severity: "warning",
        });
      }
    }
  }

  if (!hasMissingDependencyError) {
    const cycles = findDependencyCycles(tasks, taskById);
    for (const cycle of cycles) {
      const task = taskById.get(cycle[0]);
      if (!task) continue;
      addError(task.filePath, {
        filePath: task.filePath,
        field: "depends_on",
        message: `Circular dependency detected: ${cycle.join(" → ")}`,
        severity: "error",
      });
    }
  }

  const invalid = tasks
    .map(({ filePath }) => ({ filePath, errors: errorsByFile.get(filePath) ?? [] }))
    .filter(({ errors }) => errors.length > 0);
  const invalidFiles = new Set(invalid.map(({ filePath }) => filePath));
  const valid = tasks.filter(({ filePath }) => !invalidFiles.has(filePath));

  return { valid, invalid, warnings };
}

function findDependencyCycles(
  tasks: LoadedTask[],
  taskById: Map<string, LoadedTask>
): string[][] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seenCycles = new Set<string>();

  function visit(id: string): void {
    if (inStack.has(id)) {
      const cycle = [...stack.slice(stack.indexOf(id)), id];
      const key = canonicalCycleKey(cycle);
      if (!seenCycles.has(key)) {
        seenCycles.add(key);
        cycles.push(cycle);
      }
      return;
    }

    if (visited.has(id)) return;

    visited.add(id);
    inStack.add(id);
    stack.push(id);

    for (const dep of taskById.get(id)?.spec.depends_on ?? []) {
      visit(dep);
    }

    stack.pop();
    inStack.delete(id);
  }

  for (const { spec } of tasks) {
    visit(spec.id);
  }

  return cycles;
}

function canonicalCycleKey(cycle: string[]): string {
  const nodes = cycle.slice(0, -1);
  const rotations = nodes.map((_, index) => [
    ...nodes.slice(index),
    ...nodes.slice(0, index),
  ]);
  return rotations.map((rotation) => rotation.join("\0")).sort()[0] ?? "";
}
