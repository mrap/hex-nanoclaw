export interface SOViolation {
  soNumber: number;
  rule: string;
  evidence: string;
  severity: 'high' | 'medium' | 'low';
  turn: number;
}

const SO_PATTERNS = [
  { soNumber: 6, rule: 'Verify before asserting', patterns: [/this (is|will be) working/i, /confirmed working/i], severity: 'medium' as const },
  { soNumber: 15, rule: 'BOI is default delegation path', patterns: [/npm install/i, /brew install/i], severity: 'high' as const },
  { soNumber: 21, rule: 'Question uniform results', patterns: [/all tests pass/i, /100% success/i], severity: 'high' as const },
  { soNumber: 26, rule: 'Isolate before mutating', patterns: [/editing.*production/i, /writing.*directly.*src/i], severity: 'high' as const },
];

export function detectViolations(lines: string[]): SOViolation[] {
  const violations: SOViolation[] = [];
  lines.forEach((line, idx) => {
    let parsed: any; try { parsed = JSON.parse(line); } catch { return; }
    const text = JSON.stringify(parsed);
    for (const check of SO_PATTERNS) {
      for (const pattern of check.patterns) {
        if (pattern.test(text)) {
          violations.push({ soNumber: check.soNumber, rule: check.rule, evidence: text.slice(0, 200), severity: check.severity, turn: idx });
          break;
        }
      }
    }
  });
  return violations;
}
