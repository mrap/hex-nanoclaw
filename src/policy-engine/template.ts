import { shellEscape } from './shell-escape.js';

/**
 * Resolve a dotted field path against a context object.
 * Returns the resolved value or undefined if not found.
 */
export function resolveFieldPath(
  fieldPath: string,
  context: Record<string, unknown>,
): unknown {
  const parts = fieldPath.split('.');
  let value: unknown = context;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/**
 * Simple {{ field.path }} template interpolation.
 * No conditionals, no loops — just field resolution.
 */
export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, fieldPath: string) => {
    const value = resolveFieldPath(fieldPath, context);
    return value != null ? String(value) : '';
  });
}

/**
 * Shell-safe template interpolation.
 * Each interpolated value is escaped for safe use in shell commands.
 * Use this instead of renderTemplate() when the output will be passed to sh -c.
 */
export function renderTemplateShellSafe(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, fieldPath: string) => {
    const value = resolveFieldPath(fieldPath, context);
    return value != null ? shellEscape(String(value)) : "''";
  });
}
