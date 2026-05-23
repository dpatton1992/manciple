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
  const valid: LoadedTask[] = [];
  const invalid: Array<{ filePath: string; errors: ValidationIssue[] }> = [];

  // Check for duplicate IDs
  const idMap = new Map<string, string[]>();
  for (const { spec, filePath } of tasks) {
    const existing = idMap.get(spec.id) ?? [];
    idMap.set(spec.id, [...existing, filePath]);
  }

  // Build set of all task IDs for dependency checking
  const allIds = new Set(tasks.map((t) => t.spec.id));

  for (const loaded of tasks) {
    const { spec, filePath } = loaded;
    const errors: ValidationIssue[] = [];

    // Check for duplicate IDs
    const duplicates = idMap.get(spec.id) ?? [];
    if (duplicates.length > 1 && duplicates[0] !== filePath) {
      errors.push({
        filePath,
        field: "id",
        message: `Duplicate task id "${spec.id}" also found in ${duplicates[0]}`,
        severity: "error",
      });
    }

    // Check dependency references
    for (const dep of spec.depends_on ?? []) {
      if (!allIds.has(dep)) {
        errors.push({
          filePath,
          field: "depends_on",
          message: `Dependency "${dep}" references a missing task`,
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

    if (errors.length > 0) {
      invalid.push({ filePath, errors });
    } else {
      valid.push(loaded);
    }
  }

  // TODO: Detect circular dependencies (v1)
  // For now, missing-dependency check is implemented above.

  return { valid, invalid, warnings };
}
