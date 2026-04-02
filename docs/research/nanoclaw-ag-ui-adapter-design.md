# NanoClaw AG-UI Channel Adapter Design

> Research doc for spec q-373 | Written by BOI worker, iteration 4 | 2026-04-01

---

## Table of Contents

1. [HTTP Endpoint Design](#1-http-endpoint-design)
2. [Container Stdout → AG-UI Event Mapping](#2-container-stdout--ag-ui-event-mapping)
3. [Session Management](#3-session-management)
4. [Authentication](#4-authentication)
5. [Multi-Group Routing](#5-multi-group-routing)
6. [Coexistence with Slack](#6-coexistence-with-slack)
7. [TypeScript Interface Definitions](#7-typescript-interface-definitions)
8. [Complete Request Sequence Diagram](#8-complete-request-sequence-diagram)

---

## 1. HTTP Endpoint Design

The AG-UI channel exposes a minimal HTTP API surface — three endpoints that cover the full run lifecycle.

### 1.1 Endpoint Overview

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/run` | Start a new agent run; returns `runId` |
| `GET`  | `/api/stream/:runId` | Open SSE stream for AG-UI events |
| `POST` | `/api/input/:runId` | Send follow-up message or approval response |
| `GET`  | `/api/groups` | List available groups (for group switcher UI) |
| `GET`  | `/api/health` | Health check (connected channels, group count) |

### 1.2 POST /api/run

**Request body:**
```json
{
  "threadId": "thread_abc123",
  "group": "main",
  "message": "What is the status of today's landings?",
  "sessionId": "optional-existing-session-id"
}
```

**Response (201 Created):**
```json
{
  "runId": "run_1714500000000_x7k2m",
  "threadId": "thread_abc123",
  "chatJid": "web:thread_abc123:main",
  "streamUrl": "/api/stream/run_1714500000000_x7k2m"
}
```

**Behavior:**
1. Validate `group` against registered groups
2. Verify authentication token (see §4)
3. Generate `runId` = `run_${Date.now()}_${randomSuffix(5)}`
4. Construct `chatJid` = `web:${threadId}:${group}` (see §3)
5. Store run metadata in `RunRegistry` (in-memory Map)
6. Start container via `ContainerRunner` asynchronously
7. Return `runId` immediately — client connects SSE stream next

The run is **fire-and-pipe**: the container starts, and the SSE stream pipes its output to the client. The HTTP response does not wait for the container to finish.

### 1.3 GET /api/stream/:runId

This is the AG-UI SSE stream endpoint. The client (CopilotKit or custom frontend) opens a long-lived HTTP connection here and receives AG-UI events as `text/event-stream`.

**Headers required from client:**
```
Accept: text/event-stream
Authorization: Bearer <token>
Cache-Control: no-cache
```

**SSE wire format:**
```
data: {"type":"RUN_STARTED","runId":"run_...","threadId":"thread_..."}

data: {"type":"TEXT_MESSAGE_START","messageId":"msg_001","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_001","delta":"Here is "}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_001","delta":"the status:"}

data: {"type":"TEXT_MESSAGE_END","messageId":"msg_001"}

data: {"type":"RUN_FINISHED","runId":"run_...","threadId":"thread_..."}

```

**Connection lifecycle:**
- If the run is already finished when the client connects, emit the buffered events and close
- If the run is still in progress, stream live events as they arrive
- On SSE disconnect (client closes tab), mark the run as `abandoned` but do **not** kill the container — container may still be doing work. Allow reconnect within 60s.
- On reconnect, replay buffered events from the last acknowledged event ID (use `Last-Event-ID` header)

**Reconnect support via `id:` field:**
```
id: 42
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg_001","delta":"chunk"}

```

### 1.4 POST /api/input/:runId

Sends follow-up input to an active run. Used for:
- User follow-up messages in the same thread
- Approval/rejection responses for tool approval flows
- Interrupt signals (stop generation)

**Request body (follow-up message):**
```json
{
  "type": "message",
  "content": "Actually, focus only on the BOI group"
}
```

**Request body (approval response):**
```json
{
  "type": "approval",
  "approved": true,
  "toolCallId": "tc_001",
  "editedArgs": null
}
```

**Request body (interrupt):**
```json
{
  "type": "interrupt"
}
```

**Response:** `202 Accepted` or `404` if runId unknown.

Input is delivered to the running container via the IPC input directory (`/workspace/ipc/input/`). The agent-runner polls this directory and surfaces the content as a tool result or new message.

### 1.5 GET /api/groups

Returns registered groups for the frontend group switcher.

**Response:**
```json
{
  "groups": [
    { "id": "main", "name": "Main", "trigger": "", "isMain": true },
    { "id": "ops", "name": "Ops", "trigger": "@ops", "isMain": false },
    { "id": "gws", "name": "GWS", "trigger": "@gws", "isMain": false },
    { "id": "boi", "name": "BOI", "trigger": "@boi", "isMain": false }
  ]
}
```

---

## 2. Container Stdout → AG-UI Event Mapping

NanoClaw containers emit output via stdout, bounded by sentinel markers:

```
---NANOCLAW_OUTPUT_START---
<agent text output, may be multi-line>
---NANOCLAW_OUTPUT_END---
```

The AG-UI adapter must parse this stream in real-time and translate it into AG-UI events. This requires a **stdout parser** that handles two output streams concurrently: raw container stdout and structured IPC JSON files.

### 2.1 Output Parser Architecture

```
Container stdout pipe
        │
        ▼
  SentinelParser
  ┌─────────────────────────────┐
  │ state: BEFORE | INSIDE | AFTER│
  │ buffer: string               │
  └─────────────────────────────┘
        │ (INSIDE chunks)
        ▼
  ChunkClassifier
  ┌─────────────────────────────┐
  │ Detects chunk type:          │
  │  • plain text                │
  │  • tool_call JSON prefix     │
  │  • structured annotation     │
  └─────────────────────────────┘
        │
   ┌────┴────┐
   ▼         ▼
TextEmitter  ToolCallEmitter
```

### 2.2 Plain Text → TEXT_MESSAGE Events

Container stdout between sentinel markers becomes a streaming text message:

```
stdout chunk: "Here is the current status:\n- BOI: 2 specs running\n"
```

Maps to:
```json
{ "type": "TEXT_MESSAGE_START", "messageId": "msg_001", "role": "assistant" }
{ "type": "TEXT_MESSAGE_CONTENT", "messageId": "msg_001", "delta": "Here is the current status:\n- BOI: 2 specs running\n" }
```

Text is emitted in chunks as they arrive — no buffering needed for plain text. The `TEXT_MESSAGE_END` event fires when:
- A tool call annotation is encountered (pauses text stream)
- The output sentinel `---NANOCLAW_OUTPUT_END---` is seen
- The container process exits

### 2.3 IPC Tool Calls → TOOL_CALL Events

When the agent executes a tool call, NanoClaw's agent-runner writes a JSON file to `/workspace/ipc/tasks/` (or `/workspace/ipc/messages/`). The host-side IPC watcher detects these files.

The AG-UI adapter hooks into the IPC processing pipeline to emit tool call events:

```
IPC watcher detects: /workspace/ipc/tasks/tool_read_file_001.json
{
  "type": "schedule_task",   // or other IPC type
  "toolCallId": "tc_read_001",
  "toolName": "Read",
  "args": { "file_path": "/workspace/group/MEMORY.md" }
}
```

Maps to:
```json
{ "type": "TOOL_CALL_START", "toolCallId": "tc_read_001", "toolCallName": "Read", "parentMessageId": "msg_001" }
{ "type": "TOOL_CALL_ARGS", "toolCallId": "tc_read_001", "delta": "{\"file_path\": \"/workspace/group/MEMORY.md\"}" }
{ "type": "TOOL_CALL_END", "toolCallId": "tc_read_001" }
```

After the tool executes and writes its result back:
```json
{ "type": "TOOL_CALL_RESULT", "toolCallId": "tc_read_001", "messageId": "msg_tool_001", "role": "tool", "content": "# MEMORY\n..." }
```

### 2.4 AG-UI CUSTOM Events for Generative UI

When the agent wants to render a structured component (chart, status table, approval form), it emits a structured annotation in stdout between special delimiters:

```
---AGUI_COMPONENT_START---
{
  "name": "LandingsDashboard",
  "props": {
    "date": "2026-04-01",
    "groups": [...],
    "tiers": ["L1", "L2", "L3", "L4"]
  }
}
---AGUI_COMPONENT_END---
```

This maps directly to an AG-UI `CUSTOM` event:
```json
{
  "type": "CUSTOM",
  "name": "RenderComponent",
  "value": {
    "component": "LandingsDashboard",
    "props": { "date": "2026-04-01", "groups": [...] }
  }
}
```

The frontend's component registry resolves `"LandingsDashboard"` to the actual React component.

### 2.5 STATE_DELTA Events

When the agent updates shared state (e.g., landing tier status changes), it emits structured state updates via IPC `emit_event`:

```json
{
  "type": "emit_event",
  "event_type": "agent.state.delta",
  "payload": {
    "runId": "run_001",
    "delta": [
      { "op": "replace", "path": "/landings/boi/status", "value": "done" }
    ]
  }
}
```

The adapter converts this to AG-UI:
```json
{
  "type": "STATE_DELTA",
  "delta": [{ "op": "replace", "path": "/landings/boi/status", "value": "done" }]
}
```

### 2.6 Complete Mapping Table

| Container Output | AG-UI Event(s) |
|-----------------|----------------|
| Process start | `RUN_STARTED` |
| `OUTPUT_START_MARKER` seen | `TEXT_MESSAGE_START` |
| Text chunk from stdout | `TEXT_MESSAGE_CONTENT` |
| `OUTPUT_END_MARKER` seen | `TEXT_MESSAGE_END` |
| IPC tool call JSON written | `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` |
| IPC tool result written | `TOOL_CALL_RESULT` |
| `AGUI_COMPONENT_START...END` | `CUSTOM { name: "RenderComponent" }` |
| IPC `emit_event agent.state.delta` | `STATE_DELTA` |
| Process exit code 0 | `RUN_FINISHED` |
| Process exit code ≠ 0 | `RUN_ERROR` |
| Container timeout | `RUN_ERROR { message: "Container timeout" }` |

---

## 3. Session Management

### 3.1 JID Scheme

The AG-UI channel uses a structured JID prefix to encode both the conversation thread and the target group:

```
web:{threadId}:{groupFolder}
```

Examples:
- `web:thread_abc123:main` — main group, thread abc123
- `web:thread_abc123:boi` — BOI group, same thread (cross-group comparison view)
- `web:solo_xyz:gws` — direct GWS group conversation

This scheme means:
- `ownsJid(jid)` returns `true` for any JID starting with `web:`
- Group routing is embedded in the JID — no separate lookup needed at message dispatch time
- The same `threadId` can have simultaneous runs against multiple groups (dashboard view)

### 3.2 Run Registry

The `RunRegistry` is an in-memory Map that tracks active runs:

```typescript
interface RunRecord {
  runId: string;
  threadId: string;
  chatJid: string;             // web:{threadId}:{group}
  groupFolder: string;
  sessionId: string | null;    // NanoClaw container session ID for multi-turn
  status: 'running' | 'finished' | 'error' | 'abandoned';
  startedAt: number;           // Date.now()
  finishedAt: number | null;
  eventBuffer: AgUiEvent[];    // Buffered for reconnect replay
  sseClients: Set<SSEClient>;  // Active SSE connections for this run
}
```

The registry persists to disk (JSON file under `~/.boi/data/agui-runs.json`) so runs survive server restarts. Runs older than 24 hours are pruned.

### 3.3 Multi-Turn Conversation (sessionId Continuity)

When a user sends a follow-up message in the same thread, the adapter must reuse the NanoClaw container session to preserve conversation history.

Flow:
1. User sends `POST /api/run` with `threadId: "thread_abc123"` and no `sessionId`
2. Container runs, produces `newSessionId: "session_xyz"`
3. Adapter stores `sessionId = "session_xyz"` in the RunRecord for this thread+group
4. User sends another `POST /api/run` with same `threadId: "thread_abc123"`
5. Adapter looks up `sessionId` from the thread's last run and passes it to the next `ContainerInput`

The thread-to-session mapping is stored per `threadId + groupFolder`:

```typescript
// ThreadSessionMap: threadId:groupFolder → sessionId
const threadSessions = new Map<string, string>();
// key: "thread_abc123:main"  value: "session_xyz"
```

### 3.4 chatJid Routing to Container

When the adapter calls `ContainerRunner`, it maps the web JID to a `ContainerInput`:

```typescript
const containerInput: ContainerInput = {
  prompt: message,
  sessionId: threadSessions.get(`${threadId}:${groupFolder}`) ?? undefined,
  groupFolder: groupFolder,          // extracted from JID
  chatJid: chatJid,                  // "web:thread_abc123:main"
  isMain: group.isMain ?? false,
  assistantName: group.name,
};
```

The `chatJid` here is the synthetic `web:...` JID. Since the AG-UI channel `ownsJid("web:...")`, all replies from the container go back through the AG-UI channel's `sendMessage` handler — which converts them to `TEXT_MESSAGE` events on the SSE stream.

### 3.5 Thread Isolation

Each `threadId` is scoped to one browser session. The frontend generates a `threadId` on first load (stored in `localStorage`) and sends it with every request. This ensures:

- Different browser tabs get different threads
- Page refresh preserves conversation history via `sessionId` continuity
- No cross-user thread leakage (threads are validated against the auth token — see §4)

---

## 4. Authentication

### 4.1 Design Principle: Local-First

NanoClaw is a **personal agent runtime** — it runs on the user's own machine and is typically accessed from `localhost`. Multi-user scenarios are out of scope. Given this, authentication should be:

1. **Simple to set up** — one command, not OAuth flows
2. **Secure against local network snooping** — token-based, not session cookies
3. **Compatible with future remote access** — token in header, not URL

### 4.2 Static Bearer Token

On first start, the AG-UI HTTP server generates a random 256-bit token and writes it to `~/.config/nanoclaw/agui-token`:

```
nanoclaw-agui-v1-a3f8b2c91d4e5f67890abc1234def56789012345678901234567890abcdef012
```

All HTTP requests must include:
```
Authorization: Bearer nanoclaw-agui-v1-a3f8...
```

The frontend reads this token from the server at startup (passed via environment variable or a local bootstrap endpoint that only responds on `127.0.0.1`).

### 4.3 Bootstrap Endpoint

To avoid embedding the token in the frontend build, the server exposes a bootstrap endpoint that only responds to localhost requests:

```
GET /api/bootstrap
```

Response (only served to `127.0.0.1` or `::1`):
```json
{
  "token": "nanoclaw-agui-v1-...",
  "version": "1.0.0",
  "groups": ["main", "ops", "gws", "boi"]
}
```

The frontend fetches this on first load, stores the token in `sessionStorage`, and includes it in all subsequent requests.

### 4.4 Token Validation Middleware

```typescript
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'] ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!timingSafeEqual(token, AGUI_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

`timingSafeEqual` prevents timing attacks. Applied to all `/api/*` routes except `/api/bootstrap` (localhost-only check instead).

### 4.5 Future: Remote Access

For remote access (accessing NanoClaw from another machine), the token can be rotated via CLI:

```bash
nanoclaw agui token rotate
```

And exposed via a reverse proxy with TLS. No changes to the adapter code are needed — the token mechanism is already transport-independent.

---

## 5. Multi-Group Routing

### 5.1 How the Frontend Specifies a Group

Every run request includes a `group` field:
```json
{ "group": "boi", "message": "Show me running specs" }
```

The adapter validates that `group` matches a registered `groupFolder` in `registeredGroups()`. If no group is specified, the adapter defaults to the main group.

### 5.2 Group Selection via JID Prefix

The AG-UI channel adapter's `ownsJid` method parses the embedded group:

```typescript
ownsJid(jid: string): boolean {
  return jid.startsWith(WEB_JID_PREFIX);
}

function groupFromJid(jid: string): string | null {
  // "web:thread_abc123:main" → "main"
  const parts = jid.slice(WEB_JID_PREFIX.length).split(':');
  return parts.length >= 2 ? parts[1] : null;
}
```

When the container calls back to `sendMessage("web:thread_abc123:main", text)`, the adapter:
1. Extracts `groupFolder = "main"` from the JID
2. Looks up the active SSE clients for the run associated with this JID
3. Emits a `TEXT_MESSAGE` event to all connected SSE clients

### 5.3 Simultaneous Multi-Group Dashboard

The dashboard use case requires showing all 4 groups' status simultaneously. The frontend opens **4 parallel runs** — one per group — each with a separate `runId` but sharing a common `threadId`:

```
POST /api/run { "group": "main",  "threadId": "dash_session_001", "message": "/status" }
POST /api/run { "group": "ops",   "threadId": "dash_session_001", "message": "/status" }
POST /api/run { "group": "gws",   "threadId": "dash_session_001", "message": "/status" }
POST /api/run { "group": "boi",   "threadId": "dash_session_001", "message": "/status" }
```

Each returns a different `runId`. The frontend opens 4 SSE streams concurrently. The dashboard layout merges the 4 event streams into panel-per-group UI.

This is possible because NanoClaw already supports concurrent containers — the group runner has no singleton constraint.

### 5.4 Group Authorization

Non-main groups cannot be escalated to main via the web UI. The adapter enforces this by:

1. Looking up `registeredGroups()[chatJid].isMain`
2. Setting `ContainerInput.isMain` based on the database record, **not** on anything the frontend sends
3. Logging a warning if the frontend sends `"group": "main"` but the token doesn't belong to the main group owner (future: per-group tokens)

### 5.5 Group Trigger Bypass

Registered groups normally require a trigger prefix (e.g., `@boi`) in Slack. When routing via the AG-UI channel, the trigger is **not required** — the user has explicitly selected the group in the UI. The adapter bypasses trigger matching by routing directly to the correct `groupFolder` without going through the `Router`'s trigger-detection logic.

---

## 6. Coexistence with Slack

### 6.1 Both Channels Active Simultaneously

The channel registry supports multiple active channels. The `index.ts` startup sequence calls `connect()` on each registered channel independently:

```typescript
// Both channels connect concurrently
const slack = createSlackChannel(opts);
const web   = createAgUiChannel(opts);

await Promise.all([
  slack?.connect(),
  web?.connect(),
]);
```

When a message arrives on Slack, `opts.onMessage("slack:C012AB", ...)` fires. When a message arrives via the web UI, `opts.onMessage("web:thread_abc123:main", ...)` fires. The router dispatches both to containers using the same `ContainerRunner`.

### 6.2 Reply Routing (No Cross-Channel Leakage)

The `sendMessage` path uses `ownsJid` to route replies to the correct channel:

```typescript
// In the channel dispatcher (index.ts or router.ts)
async function sendMessage(jid: string, text: string): Promise<void> {
  for (const channel of activeChannels) {
    if (channel.ownsJid(jid)) {
      await channel.sendMessage(jid, text);
      return;
    }
  }
  logger.warn({ jid }, 'No channel owns this JID');
}
```

Since `slack:*` JIDs only match the Slack channel and `web:*` JIDs only match the AG-UI channel, there is no cross-channel leakage. A reply to a web-originated message will never go to Slack.

### 6.3 Shared Container Sessions

Both channels share the same `ContainerRunner` and group folder state. This means:

- A conversation started in Slack (`sessionId = sess_slack_001`) and one started in the web UI (`sessionId = sess_web_001`) are **separate sessions** — they don't share context
- If the user wants to continue a Slack conversation in the web UI, they must start a new thread — session IDs are not shared across channels
- Both channels can trigger the **same group** simultaneously (e.g., Slack sends a cron prompt to `boi` while the user is also chatting with `boi` in the web UI) — NanoClaw's container runner handles this via its queue mechanism

### 6.4 Typing Indicators

The AG-UI channel implements `setTyping` differently than Slack. In Slack, `setTyping` calls the Slack API. In the AG-UI channel, `setTyping` emits an AG-UI `STEP_STARTED` or activity event to the SSE stream:

```typescript
async setTyping(jid: string, isTyping: boolean): Promise<void> {
  const run = findRunByJid(jid);
  if (!run) return;
  emitToRun(run.runId, {
    type: isTyping ? 'STEP_STARTED' : 'STEP_FINISHED',
    stepName: 'thinking',
  });
}
```

### 6.5 IPC Messages Reach Both Channels

When a container writes an IPC message targeting another group's chatJid (e.g., BOI group sends a message to `slack:CGROUP123`), the Slack channel handles it. When a container targets `web:thread_abc123:main`, the AG-UI channel handles it. Both use the same `deps.sendMessage` dispatch path — the channels are fully symmetric from the container's perspective.

---

## 7. TypeScript Interface Definitions

```typescript
// ============================================================
// Core adapter types
// ============================================================

export const WEB_JID_PREFIX = 'web:';

export interface AgUiChannelConfig {
  /** Port for the HTTP/SSE server. Default: 3001 */
  port: number;
  /** Host to bind. Default: '127.0.0.1' (localhost-only) */
  host: string;
  /** Path to token file. Default: ~/.config/nanoclaw/agui-token */
  tokenFile: string;
  /** Max SSE event buffer per run (for reconnect replay). Default: 1000 */
  maxEventBuffer: number;
  /** How long (ms) to keep finished run data. Default: 86400000 (24h) */
  runRetentionMs: number;
}

export interface RunRequest {
  threadId: string;
  group: string;         // groupFolder identifier, e.g. "main", "boi"
  message: string;
  sessionId?: string;    // Optional: continue existing session
  context?: Record<string, unknown>;  // AG-UI context passthrough
}

export interface RunResponse {
  runId: string;
  threadId: string;
  chatJid: string;
  streamUrl: string;
}

export interface InputRequest {
  type: 'message' | 'approval' | 'interrupt';
  // For type === 'message'
  content?: string;
  // For type === 'approval'
  approved?: boolean;
  toolCallId?: string;
  editedArgs?: Record<string, unknown> | null;
}

// ============================================================
// Run registry
// ============================================================

export type RunStatus = 'running' | 'finished' | 'error' | 'abandoned';

export interface RunRecord {
  runId: string;
  threadId: string;
  chatJid: string;
  groupFolder: string;
  sessionId: string | null;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  /** Buffered events for SSE reconnect replay */
  eventBuffer: AgUiEvent[];
  /** Next event sequence number (used as SSE 'id' field) */
  nextSeq: number;
}

// ============================================================
// AG-UI event types (subset used by this adapter)
// ============================================================

export type AgUiEventType =
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_ERROR'
  | 'STEP_STARTED'
  | 'STEP_FINISHED'
  | 'TEXT_MESSAGE_START'
  | 'TEXT_MESSAGE_CONTENT'
  | 'TEXT_MESSAGE_END'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_ARGS'
  | 'TOOL_CALL_END'
  | 'TOOL_CALL_RESULT'
  | 'STATE_SNAPSHOT'
  | 'STATE_DELTA'
  | 'CUSTOM';

export interface AgUiEvent {
  type: AgUiEventType;
  timestamp?: number;
  [key: string]: unknown;
}

export interface RunStartedEvent extends AgUiEvent {
  type: 'RUN_STARTED';
  runId: string;
  threadId: string;
}

export interface RunFinishedEvent extends AgUiEvent {
  type: 'RUN_FINISHED';
  runId: string;
  threadId: string;
}

export interface RunErrorEvent extends AgUiEvent {
  type: 'RUN_ERROR';
  message: string;
  code?: string;
}

export interface TextMessageStartEvent extends AgUiEvent {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: 'assistant' | 'user' | 'system' | 'tool';
}

export interface TextMessageContentEvent extends AgUiEvent {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends AgUiEvent {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}

export interface ToolCallStartEvent extends AgUiEvent {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent extends AgUiEvent {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends AgUiEvent {
  type: 'TOOL_CALL_END';
  toolCallId: string;
}

export interface ToolCallResultEvent extends AgUiEvent {
  type: 'TOOL_CALL_RESULT';
  messageId: string;
  toolCallId: string;
  role: 'tool';
  content: string;
}

export interface StateDeltaEvent extends AgUiEvent {
  type: 'STATE_DELTA';
  delta: JsonPatchOperation[];
}

export interface StateSnapshotEvent extends AgUiEvent {
  type: 'STATE_SNAPSHOT';
  snapshot: Record<string, unknown>;
}

export interface CustomEvent extends AgUiEvent {
  type: 'CUSTOM';
  name: string;
  value: unknown;
}

export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

// ============================================================
// Channel factory signature (mirrors Slack adapter pattern)
// ============================================================

export interface AgUiChannelOpts extends ChannelOpts {
  config?: Partial<AgUiChannelConfig>;
}

export type CreateAgUiChannel = (opts: AgUiChannelOpts) => Channel | null;

// ============================================================
// Stdout parser
// ============================================================

export type ParserState = 'BEFORE_OUTPUT' | 'INSIDE_OUTPUT' | 'AFTER_OUTPUT';

export interface StdoutParserCallbacks {
  onTextChunk(chunk: string): void;
  onComponentJson(json: string): void;
  onOutputEnd(): void;
}

export interface StdoutParser {
  feed(chunk: string): void;
  flush(): void;
  getState(): ParserState;
}

// ============================================================
// Thread → session continuity
// ============================================================

export interface ThreadSessionMap {
  get(threadId: string, groupFolder: string): string | undefined;
  set(threadId: string, groupFolder: string, sessionId: string): void;
  delete(threadId: string, groupFolder: string): void;
}
```

---

## 8. Complete Request Sequence Diagram

### 8.1 Single-Group Chat (Happy Path)

```
Browser / CopilotKit          AG-UI HTTP Server         ContainerRunner         IPC Watcher
        │                            │                         │                      │
        │ POST /api/run              │                         │                      │
        │ {group:"main", msg:"hi"}   │                         │                      │
        │ ──────────────────────────>│                         │                      │
        │                            │  runContainerAsync()    │                      │
        │                            │ ───────────────────────>│                      │
        │ {runId, streamUrl}         │                         │ spawn container      │
        │ <──────────────────────────│                         │──────────────────>   │
        │                            │                         │                      │
        │ GET /api/stream/:runId     │                         │                      │
        │ ──────────────────────────>│                         │                      │
        │                            │  register SSE client    │                      │
        │ SSE: RUN_STARTED           │                         │                      │
        │ <══════════════════════════│                         │                      │
        │                            │                         │  OUTPUT_START seen   │
        │                            │  onStdoutChunk("hello") │<─────────────────────│
        │                            │ <───────────────────────│                      │
        │ SSE: TEXT_MESSAGE_START    │                         │                      │
        │ <══════════════════════════│                         │                      │
        │ SSE: TEXT_MESSAGE_CONTENT  │                         │                      │
        │ <══════════════════════════│                         │                      │
        │                            │                         │  tool call IPC file  │
        │                            │  onIpcToolCall(data)    │  written             │
        │                            │ <───────────────────────────────────────────── │
        │ SSE: TEXT_MESSAGE_END      │                         │                      │
        │ <══════════════════════════│                         │                      │
        │ SSE: TOOL_CALL_START       │                         │                      │
        │ <══════════════════════════│                         │                      │
        │ SSE: TOOL_CALL_ARGS        │                         │                      │
        │ <══════════════════════════│                         │                      │
        │ SSE: TOOL_CALL_END         │                         │                      │
        │ <══════════════════════════│                         │                      │
        │                            │                         │  OUTPUT_END seen     │
        │                            │  onOutputEnd()          │<─────────────────────│
        │                            │ <───────────────────────│                      │
        │                            │                         │  container exit(0)   │
        │ SSE: RUN_FINISHED          │ onContainerFinish()     │<─────────────────────│
        │ <══════════════════════════│ <───────────────────────│                      │
        │ [SSE stream closes]        │                         │                      │
```

### 8.2 Tool Approval Flow

```
Browser                    AG-UI HTTP Server          ContainerRunner
   │                              │                         │
   │                              │    container pauses,    │
   │                              │    writes approval req  │
   │ SSE: CUSTOM                  │    to IPC               │
   │ {name:"ApprovalRequest",     │                         │
   │  value:{tool:"send_email"}}  │                         │
   │ <════════════════════════════│                         │
   │                              │                         │
   │ [user reviews in UI]         │                         │
   │                              │                         │
   │ POST /api/input/:runId       │                         │
   │ {type:"approval",            │                         │
   │  approved:true,              │                         │
   │  toolCallId:"tc_001"}        │                         │
   │ ─────────────────────────────>                         │
   │                              │  write approval to      │
   │                              │  /workspace/ipc/input/  │
   │                              │ ───────────────────────>│
   │ 202 Accepted                 │                         │ container resumes
   │ <─────────────────────────────                         │ reads approval
   │                              │                         │
   │ SSE: TOOL_CALL_RESULT        │                         │
   │ <════════════════════════════│                         │
   │ SSE: TEXT_MESSAGE_CONTENT    │                         │
   │ <════════════════════════════│                         │
   │ SSE: RUN_FINISHED            │                         │
   │ <════════════════════════════│                         │
```

### 8.3 SSE Reconnect Flow

```
Browser                    AG-UI HTTP Server
   │                              │
   │ GET /api/stream/:runId       │
   │ [Last-Event-ID: 15]          │
   │ ─────────────────────────────>
   │                              │  look up runId
   │                              │  replay events 16..N
   │ SSE: event 16..current       │
   │ <════════════════════════════│
   │ SSE: live events resume      │
   │ <════════════════════════════│
```

---

## Decision Rationale: JID Scheme

**Decision:** Use `web:{threadId}:{groupFolder}` as the AG-UI JID format

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **`web:{threadId}:{group}`** | Encodes both thread and group; self-describing; no lookup needed | 4.5 |
| `web:{runId}` | Simple; but loses thread continuity across runs | 3.0 |
| `web:{userId}:{group}` | User-scoped; but NanoClaw is single-user, adds auth complexity | 2.5 |
| `web:{sessionId}` | Matches NanoClaw session directly; but session changes per turn | 2.0 |

**Margin:** 4.5 vs 3.0 — moderate

**Key trade-off:** Encoding group in the JID means group routing is zero-cost at message dispatch time, but it makes JIDs slightly longer and harder to read.

**Assumptions that could change the verdict:**
- If NanoClaw becomes multi-user, `{userId}` would need to be added
- If groups are added dynamically at high frequency, a UUID-based scheme would be more stable

**Dissenting view:** `web:{runId}` is simpler and avoids stale group references if a group is renamed, but loses thread continuity which is the most important property for multi-turn chat.

---

## Decision Rationale: Authentication Strategy

**Decision:** Static bearer token served via localhost-only bootstrap endpoint

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **Static bearer token + bootstrap** | Simple, secure, no UX friction for local use | 4.5 |
| No auth (localhost only) | Simplest; but any local process could call the API | 2.5 |
| Session cookies + CSRF | Web-standard; but adds server-side session state | 3.0 |
| JWT with expiry | Industry standard; but overkill for single-user local tool | 2.5 |

**Margin:** 4.5 vs 3.0 — moderate

**Key trade-off:** Static tokens don't expire automatically, but for a local personal tool the operational simplicity outweighs the theoretical risk of a leaked token (which would require access to the local filesystem anyway).

**Assumptions that could change the verdict:**
- Remote access scenarios would require rotating tokens or JWTs
- Multi-user scenarios would require per-user tokens

**Dissenting view:** No-auth mode is sufficient for `127.0.0.1` binding since the attack surface is already limited to local processes — the token is security theater on localhost.
