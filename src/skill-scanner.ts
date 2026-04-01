import yaml from 'js-yaml';

export interface ScanFinding {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  pattern: string;
  line: number;
  context: string;
}

export interface ScanResult {
  verdict: 'safe' | 'caution' | 'rejected';
  findings: ScanFinding[];
}

export const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_CONTENT_SIZE = 100_000;

interface PatternDef {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  regex: RegExp;
  label: string;
}

const SCAN_PATTERNS: PatternDef[] = [
  // Exfiltration (7 patterns)
  {
    category: 'exfiltration',
    severity: 'critical',
    regex: /curl\b.*\$\w*(KEY|TOKEN|SECRET)/i,
    label: 'curl with secret env var',
  },
  {
    category: 'exfiltration',
    severity: 'critical',
    regex: /wget\b.*\$\w*(KEY|TOKEN|SECRET)/i,
    label: 'wget with secret env var',
  },
  {
    category: 'exfiltration',
    severity: 'high',
    regex: /cat\s+\.env\b/i,
    label: 'reading .env file',
  },
  {
    category: 'exfiltration',
    severity: 'high',
    regex: /source\s+\.env\b/i,
    label: 'sourcing .env file',
  },
  {
    category: 'exfiltration',
    severity: 'critical',
    regex: /webhook\.site|requestbin/i,
    label: 'data exfil endpoint',
  },
  {
    category: 'exfiltration',
    severity: 'high',
    regex: /printenv|os\.environ|process\.env/i,
    label: 'environment enumeration',
  },
  {
    category: 'exfiltration',
    severity: 'high',
    regex: /\benv\b\s*\|/i,
    label: 'env piped output',
  },

  // Injection (7 patterns)
  {
    category: 'injection',
    severity: 'critical',
    regex: /ignore\s+previous\s+instructions/i,
    label: 'prompt injection: ignore instructions',
  },
  {
    category: 'injection',
    severity: 'critical',
    regex: /you\s+are\s+now\s+DAN/i,
    label: 'role hijacking: DAN',
  },
  {
    category: 'injection',
    severity: 'critical',
    regex: /do\s+not\s+tell\s+the\s+user/i,
    label: 'secrecy injection',
  },
  {
    category: 'injection',
    severity: 'critical',
    regex: /disregard\s+(all\s+)?rules/i,
    label: 'disregard rules',
  },
  {
    category: 'injection',
    severity: 'critical',
    regex: /system\s+prompt\s+override/i,
    label: 'system prompt override',
  },
  {
    category: 'injection',
    severity: 'critical',
    regex: /respond\s+without\s+restrictions/i,
    label: 'unrestricted response',
  },
  {
    category: 'injection',
    severity: 'high',
    regex: /you\s+are\s+now\s+a\b/i,
    label: 'role hijacking: generic',
  },

  // Destructive (7 patterns)
  {
    category: 'destructive',
    severity: 'critical',
    regex: /rm\s+-rf\s+\//i,
    label: 'rm -rf /',
  },
  {
    category: 'destructive',
    severity: 'critical',
    regex: /rm\s+-rf\s+~\//i,
    label: 'rm -rf ~/',
  },
  {
    category: 'destructive',
    severity: 'high',
    regex: /chmod\s+777/i,
    label: 'chmod 777',
  },
  {
    category: 'destructive',
    severity: 'critical',
    regex: /\bmkfs\b/i,
    label: 'mkfs',
  },
  {
    category: 'destructive',
    severity: 'critical',
    regex: /\bdd\b.*\/dev\//i,
    label: 'dd to device',
  },
  {
    category: 'destructive',
    severity: 'high',
    regex: />\s*\/etc\//i,
    label: 'write to /etc/',
  },
  {
    category: 'destructive',
    severity: 'high',
    regex: /tee\s+\/etc\//i,
    label: 'tee to /etc/',
  },

  // Persistence (7 patterns)
  {
    category: 'persistence',
    severity: 'high',
    regex: /\bcrontab\b/i,
    label: 'crontab',
  },
  {
    category: 'persistence',
    severity: 'critical',
    regex: /authorized_keys/i,
    label: 'authorized_keys',
  },
  {
    category: 'persistence',
    severity: 'high',
    regex: /ssh-keygen/i,
    label: 'ssh-keygen',
  },
  {
    category: 'persistence',
    severity: 'high',
    regex: /LaunchAgent|LaunchDaemon/i,
    label: 'LaunchAgent/Daemon',
  },
  {
    category: 'persistence',
    severity: 'high',
    regex: /systemctl|systemd/i,
    label: 'systemctl/systemd',
  },
  {
    category: 'persistence',
    severity: 'medium',
    regex: /\.bashrc|\.zshrc|\.profile/i,
    label: 'shell rc file',
  },
  {
    category: 'persistence',
    severity: 'high',
    regex: /\bsudoers\b/i,
    label: 'sudoers',
  },
];

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
  error?: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: null,
      body: content,
      error: 'Missing YAML frontmatter (must start with ---)',
    };
  }
  try {
    const parsed = yaml.load(match[1]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {
        frontmatter: null,
        body: match[2],
        error: 'Frontmatter is not a valid YAML object',
      };
    }
    return { frontmatter: parsed, body: match[2] };
  } catch {
    return {
      frontmatter: null,
      body: match[2],
      error: 'Invalid YAML in frontmatter',
    };
  }
}

export function scanSkillContent(content: string): ScanResult {
  const findings: ScanFinding[] = [];

  // Size check
  if (content.length > MAX_CONTENT_SIZE) {
    findings.push({
      category: 'validation',
      severity: 'high',
      pattern: 'size_limit',
      line: 0,
      context: `Content size ${content.length} exceeds limit of ${MAX_CONTENT_SIZE}`,
    });
    return { verdict: 'rejected', findings };
  }

  // Parse frontmatter
  const { frontmatter, body, error } = parseFrontmatter(content);
  if (error || !frontmatter) {
    findings.push({
      category: 'validation',
      severity: 'high',
      pattern: 'frontmatter',
      line: 1,
      context: error || 'Missing frontmatter',
    });
    return { verdict: 'rejected', findings };
  }

  // Required fields
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    findings.push({
      category: 'validation',
      severity: 'high',
      pattern: 'missing_name',
      line: 1,
      context: 'Frontmatter must include a "name" field',
    });
  } else if (!NAME_PATTERN.test(frontmatter.name)) {
    findings.push({
      category: 'validation',
      severity: 'high',
      pattern: 'invalid_name',
      line: 1,
      context: `Name "${frontmatter.name}" does not match pattern ${NAME_PATTERN}`,
    });
  }

  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    findings.push({
      category: 'validation',
      severity: 'high',
      pattern: 'missing_description',
      line: 1,
      context: 'Frontmatter must include a "description" field',
    });
  }

  // Empty body
  if (!body.trim()) {
    findings.push({
      category: 'validation',
      severity: 'high',
      pattern: 'empty_body',
      line: 1,
      context: 'Skill must have non-empty body after frontmatter',
    });
  }

  // Scan content lines for dangerous patterns
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of SCAN_PATTERNS) {
      if (pat.regex.test(line)) {
        findings.push({
          category: pat.category,
          severity: pat.severity,
          pattern: pat.label,
          line: i + 1,
          context: line.trim().substring(0, 120),
        });
      }
    }
  }

  // Determine verdict
  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );
  if (hasCriticalOrHigh) {
    return { verdict: 'rejected', findings };
  }
  if (findings.length > 0) {
    return { verdict: 'caution', findings };
  }
  return { verdict: 'safe', findings };
}
