# NanoClaw AG-UI: Agentic UI Update Architecture

> Research doc for spec q-373 | Written by BOI worker, iteration 3 | 2026-04-01

---

## Table of Contents

1. [StateDelta → React State (No Jank)](#1-statedelta--react-state-no-jank)
2. [Streaming Text Rendering](#2-streaming-text-rendering)
3. [Tool Call UI Mid-Stream](#3-tool-call-ui-mid-stream)
4. [Generative UI via CustomEvent](#4-generative-ui-via-customevent)
5. [Error Recovery & Reconnection](#5-error-recovery--reconnection)
6. [Multi-Group State Coordination](#6-multi-group-state-coordination)
7. [Optimistic Updates](#7-optimistic-updates)

---

## 1. StateDelta → React State (No Jank)

### Problem

AG-UI `STATE_DELTA` events carry RFC 6902 JSON Patch operations that can arrive at 30–100 Hz during active agent runs (e.g., a BOI spec updating task statuses, a landings dashboard refreshing). Naively applying each patch to React state via `setState` triggers a re-render per patch — causing layout thrash, dropped frames, and jank.

### Solution: Batched RAF Reconciliation

```
┌─────────────────────────────────────────────────────────────────┐
│  SSE stream                                                      │
│                                                                  │
│  STATE_DELTA ──► patchQueue[]  ──► rAF flush  ──► setState once │
│  STATE_DELTA ──► patchQueue[]  ──┘                              │
│  STATE_DELTA ──► patchQueue[]  ──┘                              │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// src/hooks/useAgentState.ts

import { useRef, useState, useEffect, useCallback } from 'react';
import { applyPatch, Operation } from 'fast-json-patch';

interface AgentStateManager<T> {
  state: T;
  applySnapshot: (snapshot: T) => void;
  applyDelta: (ops: Operation[]) => void;
}

export function useAgentState<T>(initial: T): AgentStateManager<T> {
  const [state, setState] = useState<T>(initial);
  
  // Accumulate patches between rAF ticks
  const patchQueueRef = useRef<Operation[]>([]);
  const rafPendingRef = useRef<boolean>(false);
  const stateRef = useRef<T>(initial);

  const flush = useCallback(() => {
    rafPendingRef.current = false;
    if (patchQueueRef.current.length === 0) return;

    const ops = patchQueueRef.current;
    patchQueueRef.current = [];

    const next = applyPatch(
      stateRef.current,
      ops,
      /* validate */ false,
      /* mutate */ false  // immutable — returns new object
    ).newDocument;

    stateRef.current = next;
    setState(next);
  }, []);

  const applyDelta = useCallback((ops: Operation[]) => {
    patchQueueRef.current.push(...ops);
    if (!rafPendingRef.current) {
      rafPendingRef.current = true;
      requestAnimationFrame(flush);
    }
  }, [flush]);

  const applySnapshot = useCallback((snapshot: T) => {
    // Snapshot = full replace; drain queue first
    patchQueueRef.current = [];
    if (rafPendingRef.current) {
      cancelAnimationFrame(rafPendingRef.current as any);
      rafPendingRef.current = false;
    }
    stateRef.current = snapshot;
    setState(snapshot);
  }, []);

  return { state, applySnapshot, applyDelta };
}
```

**Key properties:**
- **One `setState` per animation frame** — React batches state updates automatically within a single synchronous call, so all queued patches produce a single re-render per frame.
- **Immutable patch** — `fast-json-patch` returns a new object, so React's shallow equality check correctly identifies changed subtrees.
- **Snapshot trumps queue** — On `STATE_SNAPSHOT` (e.g., after reconnect), the patch queue is drained and replaced atomically.
- **`useTransition` for expensive trees** — For large state trees (like a full BOI spec with many tasks), wrap `setState` in `startTransition` so React can interrupt and yield to higher-priority inputs.

### React 18 Concurrent Mode Integration

```typescript
import { startTransition, useTransition } from 'react';

// In flush():
startTransition(() => {
  setState(next); // lower-priority — can be interrupted
});
```

This ensures rapid `STATE_DELTA` events never block user interactions (typing, clicking approve buttons).

### Virtual DOM Reconciliation Strategy

For list-heavy state (task lists, landing items), use stable `key` props derived from item IDs rather than array indices. This prevents React from re-mounting components when items are reordered by JSON Patch `move` operations.

---

## 2. Streaming Text Rendering

### The AG-UI Text Streaming Pattern

```
TEXT_MESSAGE_START  { messageId: "msg_1", role: "assistant" }
TEXT_MESSAGE_CONTENT { messageId: "msg_1", delta: "Hello" }
TEXT_MESSAGE_CONTENT { messageId: "msg_1", delta: ", how" }
TEXT_MESSAGE_CONTENT { messageId: "msg_1", delta: " can I help" }
TEXT_MESSAGE_END    { messageId: "msg_1" }
```

### Rendering Strategy: Chunk-Based Append (Recommended)

Two approaches exist. Chunk-based append is recommended for NanoClaw:

| Approach | Latency | CPU | Markdown-safe | Recommendation |
|----------|---------|-----|---------------|----------------|
| **Chunk-based append** | Immediate | Low | ✅ Yes | **Use this** |
| Typewriter effect | +50–200ms | Medium | ⚠️ Complex | Skip |

**Why not typewriter?** Typewriter effects must buffer the full delta and emit characters one by one. This adds latency, CPU overhead, and breaks markdown parsing (you can't tokenize mid-word). For an agentic UI where the agent output is the primary information channel, latency > aesthetics.

### Chunk-Based Append Implementation

```typescript
// src/store/messages.ts (Zustand slice)

interface StreamingMessage {
  id: string;
  role: string;
  chunks: string[];       // Raw chunks, appended as they arrive
  complete: boolean;
  fullText?: string;      // Computed once complete
}

// On TEXT_MESSAGE_START:
set(state => ({
  messages: [...state.messages, { id, role, chunks: [], complete: false }]
}));

// On TEXT_MESSAGE_CONTENT:
set(state => ({
  messages: state.messages.map(m =>
    m.id === messageId
      ? { ...m, chunks: [...m.chunks, delta] }
      : m
  )
}));

// On TEXT_MESSAGE_END:
set(state => ({
  messages: state.messages.map(m =>
    m.id === messageId
      ? { ...m, complete: true, fullText: m.chunks.join('') }
      : m
  )
}));
```

### Rendering Streaming vs Complete Text

```tsx
// src/components/MessageContent.tsx

function MessageContent({ message }: { message: StreamingMessage }) {
  if (message.complete) {
    // Full markdown parse — runs once
    return <MarkdownRenderer content={message.fullText!} />;
  }

  // Streaming: render raw chunks + cursor
  const partialText = message.chunks.join('');
  return (
    <div className="streaming-message">
      {/* Plain text during streaming for performance */}
      <pre className="font-sans whitespace-pre-wrap">{partialText}</pre>
      <span className="cursor animate-pulse">▋</span>
    </div>
  );
}
```

**Key insight:** During streaming, avoid parsing markdown — tokenizers can't handle incomplete tokens (e.g., a backtick without its closing pair). Render as plain pre-formatted text with a cursor. On `TEXT_MESSAGE_END`, swap to a full `<MarkdownRenderer>` — the re-mount is invisible because it happens in the same frame React processes the `complete: true` state change.

### Code Block Streaming

When the agent streams a code fence (`` ```typescript ``), the streaming view shows it as plain text. On completion, `shiki` syntax-highlights the full block. To avoid a flash of unstyled content, use a `Suspense` boundary with a skeleton:

```tsx
<Suspense fallback={<CodeSkeleton lines={estimatedLines} />}>
  <SyntaxHighlighter code={message.fullText} lang={lang} />
</Suspense>
```

---

## 3. Tool Call UI Mid-Stream

### The Problem

The agent is mid-sentence when it decides to call a tool. The event sequence is:

```
TEXT_MESSAGE_START  { messageId: "msg_1" }
TEXT_MESSAGE_CONTENT { delta: "Let me check that file for you" }
TEXT_MESSAGE_END    { messageId: "msg_1" }
TOOL_CALL_START     { toolCallId: "tc_1", toolCallName: "read_file", parentMessageId: "msg_1" }
TOOL_CALL_ARGS      { toolCallId: "tc_1", delta: '{"path":"/Users' }
TOOL_CALL_ARGS      { toolCallId: "tc_1", delta: '/mrap/mrap-hex/todo.md"}' }
TOOL_CALL_END       { toolCallId: "tc_1" }
TOOL_CALL_RESULT    { toolCallId: "tc_1", content: "..." }
```

The UI must:
1. Show partial text as it streams
2. Insert a tool call card inline, immediately after `TOOL_CALL_START`
3. Show the tool card as "pending" while args stream
4. Show the tool card as "running" after `TOOL_CALL_END`
5. Show result inline on `TOOL_CALL_RESULT`

### Message Block Model

Each message in the UI is composed of **blocks** — alternating text and tool-call segments:

```typescript
type MessageBlock =
  | { kind: 'text'; messageId: string; chunks: string[]; complete: boolean }
  | { kind: 'tool_call'; toolCallId: string; toolCallName: string;
      argChunks: string[]; complete: boolean; result?: string;
      parentMessageId: string; };

interface ConversationMessage {
  id: string;
  role: string;
  blocks: MessageBlock[];
}
```

### Tool Card Component

```tsx
// src/components/ToolCallCard.tsx

type ToolCallStatus = 'streaming_args' | 'running' | 'complete' | 'error';

function ToolCallCard({ block }: { block: ToolCallBlock }) {
  const status = getStatus(block);
  const parsedArgs = tryParseArgs(block.argChunks.join(''));

  return (
    <div className="tool-call-card border rounded-lg p-3 my-2 bg-muted/30">
      <div className="flex items-center gap-2">
        <ToolIcon name={block.toolCallName} />
        <span className="font-mono text-sm font-medium">{block.toolCallName}</span>
        <StatusBadge status={status} />
      </div>

      {parsedArgs && (
        <ArgPreview args={parsedArgs} toolName={block.toolCallName} />
      )}

      {block.result && status === 'complete' && (
        <ResultPreview result={block.result} />
      )}
    </div>
  );
}
```

### Approval Gate Tool

For destructive operations, the tool card becomes an interactive approval form:

```tsx
// When toolCallName is in APPROVAL_REQUIRED_TOOLS:
function ApprovalToolCard({ block, onApprove, onReject, onEdit }) {
  return (
    <div className="tool-call-card border-2 border-amber-400 ...">
      <AlertHeader message={`Agent wants to: ${formatIntent(block)}`} />
      <ContextPreview args={parsedArgs} />
      <DiffPreview if={block.toolCallName === 'edit_file'} args={parsedArgs} />
      <div className="flex gap-2 mt-3">
        <Button variant="destructive" onClick={onReject}>Reject</Button>
        <Button variant="outline" onClick={onEdit}>Edit</Button>
        <Button onClick={onApprove}>Approve</Button>
      </div>
    </div>
  );
}
```

The approval result is sent back via `TOOL_CALL_RESULT` with `content: "approved"` or `content: "rejected: reason"`.

### Sequence Diagram: Tool Call Mid-Stream

```
Frontend UI          Event Bus           Agent (SSE stream)
    │                    │                       │
    │                    │◄── TEXT_MESSAGE_START ─┤
    │◄── render text ────┤                       │
    │                    │◄── TEXT_MSG_CONTENT×N ─┤
    │◄── append chunk ───┤                       │
    │                    │◄── TEXT_MESSAGE_END ───┤
    │◄── finalize text ──┤                       │
    │                    │◄── TOOL_CALL_START ────┤
    │◄── insert card ────┤  (status: pending)    │
    │                    │◄── TOOL_CALL_ARGS×N ───┤
    │◄── update card ────┤  (streaming args)     │
    │                    │◄── TOOL_CALL_END ──────┤
    │◄── card: running ──┤                       │
    │    [if approval]   │                       │
    │◄── show dialog ────┤                       │
    │    user clicks ────►── TOOL_CALL_RESULT ───►│
    │◄── card: done ─────┤                       │
    │                    │◄── RUN_FINISHED ───────┤
```

---

## 4. Generative UI via CustomEvent

### Concept

An agent can instruct the frontend to render a specific rich component by emitting a `CUSTOM` event. This is "generative UI": the agent decides the presentation, not just the content.

```typescript
// Agent emits:
{
  type: "CUSTOM",
  name: "render_component",
  value: {
    component: "LandingsDashboard",
    props: {
      date: "2026-04-01",
      items: [/* ... */]
    }
  }
}
```

### Component Registry

The frontend maintains a typed registry mapping component names to React components:

```typescript
// src/generative-ui/registry.ts

import type { ComponentType } from 'react';

type GenerativeComponent<P = any> = ComponentType<P>;

const REGISTRY: Record<string, GenerativeComponent> = {
  LandingsDashboard: lazy(() => import('../components/LandingsDashboard')),
  BOISpecMonitor:    lazy(() => import('../components/BOISpecMonitor')),
  ToolApprovalForm:  lazy(() => import('../components/ToolApprovalForm')),
  MemoryExplorer:    lazy(() => import('../components/MemoryExplorer')),
  DecisionLog:       lazy(() => import('../components/DecisionLog')),
  FileBrowser:       lazy(() => import('../components/FileBrowser')),
  MultiGroupStatus:  lazy(() => import('../components/MultiGroupStatus')),
  MeetingPrepDoc:    lazy(() => import('../components/MeetingPrepDoc')),
  DataChart:         lazy(() => import('../components/DataChart')),
  DataTable:         lazy(() => import('../components/DataTable')),
};

export function resolveComponent(name: string): GenerativeComponent | null {
  return REGISTRY[name] ?? null;
}
```

### Rendering in the Message Stream

When a `CUSTOM` event with `name: "render_component"` arrives, it inserts a `generative` block into the message:

```typescript
type GenerativeBlock = {
  kind: 'generative';
  component: string;
  props: Record<string, unknown>;
};
```

```tsx
// In MessageBlockRenderer:
case 'generative': {
  const Component = resolveComponent(block.component);
  if (!Component) return <UnknownComponentFallback name={block.component} />;
  return (
    <Suspense fallback={<ComponentSkeleton />}>
      <Component {...block.props} />
    </Suspense>
  );
}
```

### Security: Props Sanitization

Props from the agent are untrusted. Before passing to components:

```typescript
function sanitizeProps(props: unknown, schema: ZodSchema): Record<string, unknown> {
  const result = schema.safeParse(props);
  if (!result.success) {
    console.warn('Invalid generative UI props:', result.error);
    return {};
  }
  return result.data;
}
```

Each registered component exports a Zod schema. The registry validates before rendering.

---

## 5. Error Recovery & Reconnection

### Failure Modes

| Failure | Symptom | Recovery |
|---------|---------|----------|
| SSE disconnect (network) | `EventSource` emits `error` | Reconnect with exponential backoff |
| SSE disconnect (server restart) | Last-Event-ID lost | Request `STATE_SNAPSHOT` on reconnect |
| Stale state (missed deltas) | Checksum mismatch | Request `STATE_SNAPSHOT` |
| Agent crashes mid-run | No `RUN_FINISHED` received | Timeout after 30s, show error state |
| Partial tool result | `TOOL_CALL_RESULT` never arrives | Timeout, allow user to re-trigger |

### Reconnection with `Last-Event-ID`

The SSE protocol supports `Last-Event-ID` — the server tracks event IDs and can replay missed events on reconnect. For this to work, the NanoClaw adapter must:
1. Assign a monotonically increasing `id:` field to each SSE event.
2. On reconnect, check `Last-Event-ID` header and replay from that point.

If the server can't replay (e.g., buffer too old), it emits a `STATE_SNAPSHOT` instead.

### Reconnection State Machine

```
         ┌──────────────────────────────────────────────────────────┐
         │                                                          │
  IDLE ──►  CONNECTING ──► CONNECTED ──► ERROR ──► RECONNECTING ──┘
                                │                        │
                           DISCONNECTED                  │
                                │                        │
                           (user closed)       (backoff: 1s, 2s, 4s, 8s, max 30s)
```

```typescript
// src/hooks/useSSEConnection.ts

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'reconnecting';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function useSSEConnection(runId: string, handlers: EventHandlers) {
  const [state, setState] = useState<ConnectionState>('idle');
  const retriesRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    const url = lastEventIdRef.current
      ? `/api/stream/${runId}?lastEventId=${lastEventIdRef.current}`
      : `/api/stream/${runId}`;

    const es = new EventSource(url);
    esRef.current = es;
    setState('connecting');

    es.onopen = () => {
      setState('connected');
      retriesRef.current = 0;
    };

    es.onmessage = (e) => {
      lastEventIdRef.current = e.lastEventId;
      handlers.onEvent(JSON.parse(e.data));
    };

    es.onerror = () => {
      es.close();
      if (retriesRef.current >= MAX_RETRIES) {
        setState('error');
        return;
      }
      setState('reconnecting');
      const delay = BASE_DELAY_MS * Math.pow(2, retriesRef.current);
      retriesRef.current++;
      setTimeout(connect, Math.min(delay, 30_000));
    };
  }, [runId, handlers]);

  useEffect(() => { connect(); return () => esRef.current?.close(); }, [connect]);

  return state;
}
```

### Stale State Detection via Sequence Numbers

The NanoClaw adapter assigns a monotonically increasing `seq` to each `STATE_DELTA` event. The frontend tracks `expectedSeq` and detects gaps:

```typescript
if (event.seq !== expectedSeq) {
  // Missed deltas — request fresh snapshot
  requestStateSnapshot(runId);
} else {
  applyDelta(event.delta);
  expectedSeq++;
}
```

### Agent Run Timeout

If `RUN_FINISHED` or `RUN_ERROR` is not received within 60 seconds of the last event, the UI transitions to a `timed_out` state:

```typescript
const HEARTBEAT_TIMEOUT_MS = 60_000;

useEffect(() => {
  const timer = setTimeout(() => {
    setRunState('timed_out');
    showToast({ title: 'Agent stopped responding', variant: 'warning' });
  }, HEARTBEAT_TIMEOUT_MS);

  return () => clearTimeout(timer);
}, [lastEventTimestamp]);
```

---

## 6. Multi-Group State Coordination

### Problem

NanoClaw has 4 groups: `main`, `ops`, `gws`, `boi`. In the dashboard view, all 4 may emit `STATE_DELTA` events simultaneously. Without coordination:
- Two groups update the same key → last-write-wins (may lose data)
- Renders happen out of order → flickering
- A slow group blocks the UI → visible lag

### Namespaced State Tree

Each group owns a separate namespace in the global state:

```typescript
interface NanoclawUIState {
  groups: {
    main: GroupState;
    ops:  GroupState;
    gws:  GroupState;
    boi:  GroupState;
  };
  shared: SharedState;  // Cross-group data (e.g., approval queue)
}

interface GroupState {
  connectionStatus: 'connected' | 'reconnecting' | 'offline';
  currentRun: RunState | null;
  messages: ConversationMessage[];
  agentState: Record<string, unknown>;  // Group-specific via STATE_DELTA
}
```

JSON Patch paths are prefixed by group: `/groups/boi/agentState/tasks/0/status`. Groups can never accidentally overwrite each other's state.

### Per-Group Event Queues

Each group has its own `patchQueue` and `rAF` scheduler (from §1). They flush independently — a burst from `boi` doesn't delay renders for `main`.

```typescript
// src/store/multiGroupStore.ts

const groupStores = {
  main: createGroupStore('main'),
  ops:  createGroupStore('ops'),
  gws:  createGroupStore('gws'),
  boi:  createGroupStore('boi'),
};

function createGroupStore(groupId: GroupId) {
  return {
    ...useAgentState(initialGroupState()),
    groupId,
    // Independent rAF scheduler per group
  };
}
```

### Cross-Group Shared State: Approval Queue

The approval queue is the one shared resource. It uses a simple append-only structure with atomic Zustand updates:

```typescript
// Approval requests can come from any group
interface ApprovalRequest {
  id: string;
  groupId: GroupId;
  toolCallId: string;
  toolCallName: string;
  args: unknown;
  requestedAt: number;
}

// Zustand: atomic append
addApprovalRequest: (req: ApprovalRequest) =>
  set(state => ({
    shared: {
      ...state.shared,
      approvalQueue: [...state.shared.approvalQueue, req]
    }
  })),
```

### Conflict Resolution

Since each group owns its namespace, conflicts cannot arise across groups. Within a group, AG-UI's ordered event stream (SSE is ordered by definition) ensures deterministic patch application. If the same `STATE_DELTA` arrives twice (due to reconnect replay), the sequence number check (§5) deduplicates.

### Multi-Group Sequence Diagram

```
UI Store          main bus       ops bus        gws bus        boi bus
   │                 │              │              │              │
   │◄── STATE_DELTA──┤              │              │              │
   │  (queue: main)  │              │              │              │
   │                 │◄─STATE_DELTA─┤              │              │
   │  (queue: ops)   │              │              │              │
   │                 │              │◄─STATE_DELTA─┤              │
   │  (queue: gws)   │              │              │              │
   │                 │              │              │◄─STATE_DELTA─┤
   │  (queue: boi)   │              │              │              │
   │                 │              │              │              │
   │◄── rAF tick ────┴──────────────┴──────────────┴──────────────┘
   │  flush all 4 queues in one setState call per group
   │  → 4 independent React renders (concurrent mode: interleaved)
```

---

## 7. Optimistic Updates

### Use Case

The user edits a landing status (e.g., marks "Email newsletter" as L2 instead of L3) in the Landings Dashboard. The backend agent must confirm the change (it may have constraints). The UI should feel instant — no loading spinner before the visual update.

### Pattern: Optimistic State + Rollback

```typescript
// src/hooks/useLandingStatus.ts

function useLandingStatus(itemId: string) {
  const { agentState, applyDelta } = useGroupStore('boi');
  
  // Track pending optimistic updates
  const pendingRef = useRef<Map<string, unknown>>(new Map());

  const updateStatus = useCallback(async (newStatus: LandingTier) => {
    const item = agentState.landings.items.find(i => i.id === itemId);
    const prevStatus = item?.status;

    // 1. Apply optimistic update immediately
    applyDelta([{
      op: 'replace',
      path: `/landings/items/${itemIndex}/status`,
      value: newStatus
    }]);
    
    pendingRef.current.set(itemId, prevStatus);

    // 2. Send to backend
    try {
      await sendUserInput({
        type: 'landing_status_update',
        itemId,
        status: newStatus
      });
      // Backend will confirm via STATE_DELTA — which matches what we applied
      pendingRef.current.delete(itemId);
    } catch (err) {
      // 3. Rollback on failure
      applyDelta([{
        op: 'replace',
        path: `/landings/items/${itemIndex}/status`,
        value: prevStatus
      }]);
      pendingRef.current.delete(itemId);
      showToast({ title: 'Update failed', description: err.message, variant: 'error' });
    }
  }, [agentState, itemId, applyDelta]);

  return { updateStatus };
}
```

### Conflict Handling: Backend Overrides Optimistic

The agent may reject or modify the user's change. The canonical flow:

```
User edits item  ──► optimistic delta applied locally
                 ──► backend receives edit request
                 ──► agent validates, may modify
                 ──► STATE_DELTA arrives (agent's version)
                     └─ if matches optimistic: no-op (idempotent)
                     └─ if differs: backend version wins (agent has authority)
```

The key insight: the backend `STATE_DELTA` is applied through the same `applyDelta` path as the optimistic update. If the agent confirms the change, the patch is idempotent (no visual change). If the agent overrides, the backend version replaces the optimistic one. This requires the agent to always emit a `STATE_DELTA` confirming or correcting user edits.

### Pending Indicator

While a user edit is pending confirmation, show a subtle indicator:

```tsx
<StatusBadge
  status={item.status}
  pending={pendingRef.current.has(item.id)}
  className={pending ? 'opacity-70 italic' : ''}
/>
```

### Optimistic Update Sequence Diagram

```
User         Frontend UI        Zustand Store      Backend Agent
  │               │                   │                  │
  │─ edit status─►│                   │                  │
  │               │── optimistic ────►│                  │
  │◄── instant ───│   delta applied   │                  │
  │   visual ─────│                   │                  │
  │               │───── send edit ───┼─────────────────►│
  │               │                   │                  │─ validate
  │               │                   │                  │─ apply
  │               │◄────── STATE_DELTA (confirmed) ──────┤
  │               │── apply delta ───►│                  │
  │               │   (idempotent)    │   ← no visual    │
  │               │                   │     change       │
  │               │                   │                  │
  │               │   [if rejected]   │                  │
  │               │◄────── STATE_DELTA (override) ───────┤
  │               │── apply delta ───►│                  │
  │◄── corrected ─│   (rollback)      │                  │
  │   visual ─────│                   │                  │
```

---

## Architecture Summary

The seven mechanisms form a coherent layered system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NanoClaw UI Runtime                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Multi-Group SSE Layer (§6)                                  │   │
│  │  ┌─────────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │   │
│  │  │  main   │ │ ops  │ │ gws  │ │ boi  │  ← 4 SSE streams   │   │
│  │  └────┬────┘ └──┬───┘ └──┬───┘ └──┬───┘                    │   │
│  └───────┼─────────┼────────┼────────┼────────────────────────┘   │
│          │         │        │        │                              │
│  ┌───────▼─────────▼────────▼────────▼────────────────────────┐   │
│  │  Event Router                                               │   │
│  │  TEXT_* ──► Message Store   STATE_DELTA ──► rAF Batcher     │   │
│  │  TOOL_* ──► Tool Call Store CUSTOM ──────► GenUI Registry   │   │
│  │  RUN_*  ──► Run State       ERROR ────────► Error Recovery  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│          │                          │                               │
│  ┌───────▼──────────────┐  ┌────────▼──────────────────────────┐   │
│  │  Message Renderer    │  │  State Renderer                   │   │
│  │  • Chunk append (§2) │  │  • JSON Patch + rAF batch (§1)   │   │
│  │  • Tool cards (§3)   │  │  • Optimistic updates (§7)       │   │
│  │  • Approval gates    │  │  • Namespaced groups (§6)        │   │
│  │  • GenUI blocks (§4) │  └───────────────────────────────────┘   │
│  └──────────────────────┘                                          │
│          │                                                          │
│  ┌───────▼──────────────────────────────────────────────────────┐   │
│  │  Error Recovery Layer (§5)                                   │   │
│  │  • Exponential backoff reconnect                             │   │
│  │  • Last-Event-ID replay                                      │   │
│  │  • Sequence number gap detection                             │   │
│  │  • STATE_SNAPSHOT on stale detection                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Technology Choices

| Concern | Technology | Reason |
|---------|-----------|--------|
| State management | Zustand | Minimal boilerplate, per-slice stores, no provider tree |
| JSON Patch | `fast-json-patch` | RFC 6902 compliant, immutable mode, ~3KB |
| Markdown | `react-markdown` + `remark-gfm` | Battle-tested, safe HTML rendering |
| Syntax highlight | `shiki` | Zero client-side bundle for tokenizer (WASM) |
| Streaming control | native `EventSource` + `AbortController` | No dependencies, reconnect support built-in |
| React update priority | `startTransition` | State deltas are deferrable, not urgent |
| Props validation | `zod` | Runtime-safe generative UI props |

---

## Decision Rationale: Chunk-Based vs Typewriter Text Streaming

**Decision:** Use chunk-based append (immediate render of each delta) rather than typewriter effect

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **Chunk-based append** | Render each `TEXT_MESSAGE_CONTENT` delta immediately as plain text | 4.5 |
| Typewriter effect | Buffer delta, emit one character at a time with setInterval | 2.5 |
| Sentence-boundary batching | Buffer chunks until sentence end, render full sentence | 3.0 |

**Margin:** 4.5 vs 3.0 — clear winner

**Key trade-off:** Typewriter looks "conversational" but adds 50–200ms latency per character and makes markdown parsing impossible during streaming. For an agentic CLI interface where the user is watching agent reasoning, latency and correctness outweigh aesthetic polish.

**Assumptions that could change the verdict:**
- If NanoClaw UI is consumer-facing (not power-user) — typewriter might feel more approachable
- If AG-UI chunks are very large (whole paragraphs) — sentence batching becomes relevant

**Dissenting view:** Typewriter effects create a sense of "thinking" that makes agent behavior feel more deliberate and trustworthy to non-technical users. For hex's primary users (the operator themselves), this is irrelevant — but if NanoClaw ever gets a customer-facing UI, reconsider.

---

## Decision Rationale: Per-Group vs Merged State Tree

**Decision:** Use per-group namespaced state with independent rAF queues

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **Per-group namespaced** | Each group has `/groups/{id}/` prefix, independent flush scheduler | 4.5 |
| Single merged store | All events go into one Zustand store, one rAF flush | 3.0 |
| Separate Zustand instances | One `create()` store per group, no shared state object | 4.0 |

**Margin:** 4.5 vs 4.0 — moderate

**Key trade-off:** Separate instances are cleanest (zero cross-contamination) but make cross-group operations (approval queue, dashboard aggregation) harder — requires Zustand's `subscribe` API to sync between stores. Namespacing in one store gives a single source of truth for cross-group views while keeping patch paths isolated.

**Assumptions that could change the verdict:**
- If groups scale beyond 4 (unlikely in current NanoClaw) — separate instances scale better
- If React 19's `use()` hook is adopted widely — single store becomes even more ergonomic

**Dissenting view:** A single flat Zustand store with careful key naming is simpler to debug with Redux DevTools and avoids the risk of patch path collisions becoming hard to trace.
