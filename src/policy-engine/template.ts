/**
 * Simple {{ field.path }} template interpolation.
 * No conditionals, no loops — just field resolution.
 */
export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, fieldPath: string) => {
    const parts = fieldPath.split('.');
    let value: unknown = context;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return '';
      value = (value as Record<string, unknown>)[part];
    }
    return value != null ? String(value) : '';
  });
}
