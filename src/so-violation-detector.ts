/**
 * Standing Order (SO) violation detector.
 *
 * Analyzes task result text from task_run_logs for patterns that indicate
 * violations of standing operating rules. Originally written for session
 * transcripts; repurposed for task-run result text.
 *
 * Used by the weekly telemetry rollup to scan correction/error signals.
 */

export interface SOViolation {
  soNumber: number;
  rule: string;
  evidence: string;
  severity: 'high' | 'medium' | 'low';
}

const SO_PATTERNS = [
  {
    soNumber: 6,
    rule: 'Verify before asserting',
    patterns: [/this (is|will be) working/i, /confirmed working/i],
    severity: 'medium' as const,
  },
  {
    soNumber: 15,
    rule: 'BOI is default delegation path',
    patterns: [/npm install/i, /brew install/i],
    severity: 'high' as const,
  },
  {
    soNumber: 21,
    rule: 'Question uniform results',
    patterns: [/all tests pass/i, /100% success/i],
    severity: 'high' as const,
  },
  {
    soNumber: 26,
    rule: 'Isolate before mutating',
    patterns: [/editing.*production/i, /writing.*directly.*src/i],
    severity: 'high' as const,
  },
];

/**
 * Scan task result text for SO violations.
 * @param resultText - The result field from task_run_logs
 */
export function detectViolationsInResult(resultText: string): SOViolation[] {
  const violations: SOViolation[] = [];
  for (const check of SO_PATTERNS) {
    for (const pattern of check.patterns) {
      if (pattern.test(resultText)) {
        violations.push({
          soNumber: check.soNumber,
          rule: check.rule,
          evidence: resultText.slice(0, 200),
          severity: check.severity,
        });
        break; // one violation per SO per result
      }
    }
  }
  return violations;
}

/**
 * Scan multiple result texts (e.g. from a week of task_run_logs).
 * Returns deduplicated violations grouped by SO number.
 */
export function scanResultBatch(
  results: Array<{ task_id: string; result: string | null }>,
): Array<SOViolation & { task_id: string }> {
  const found: Array<SOViolation & { task_id: string }> = [];
  for (const { task_id, result } of results) {
    if (!result) continue;
    const violations = detectViolationsInResult(result);
    for (const v of violations) {
      found.push({ ...v, task_id });
    }
  }
  return found;
}
