# NanoClaw AG-UI: Frontend Application Architecture

> Research doc for spec q-373 | Written by BOI worker, iteration 5 | 2026-04-01

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Recommended Stack](#2-recommended-stack)
3. [Key Components to Build](#3-key-components-to-build)
4. [CopilotKit Integration](#4-copilotkit-integration)
5. [Development Workflow](#5-development-workflow)
6. [Deployment Strategy](#6-deployment-strategy)

---

## 1. Project Structure

```
nanoclaw-ui/
├── public/
│   └── favicon.ico
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── layout.tsx              # Root layout: providers, theme, fonts
│   │   ├── page.tsx                # Root → redirect to /chat/main
│   │   ├── chat/
│   │   │   ├── [group]/
│   │   │   │   └── page.tsx        # Chat panel for a given group
│   │   │   └── layout.tsx          # Sidebar + group switcher shell
│   │   ├── dashboard/
│   │   │   └── page.tsx            # Multi-group status dashboard
│   │   ├── boi/
│   │   │   └── [specId]/
│   │   │       └── page.tsx        # BOI spec monitoring view
│   │   ├── landings/
│   │   │   └── page.tsx            # Landings L1-L4 dashboard
│   │   ├── memory/
│   │   │   └── page.tsx            # Memory/context explorer
│   │   ├── decisions/
│   │   │   └── page.tsx            # Decision log
│   │   └── settings/
│   │       └── page.tsx            # Settings panel
│   │
│   ├── components/                 # Reusable UI components
│   │   ├── ui/                     # shadcn/ui installed components (owned code)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── command.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── sonner.tsx          # Toast via Sonner
│   │   │   ├── table.tsx
│   │   │   └── ... (80+ components from shadcn)
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx       # Main chat panel (messages + input)
│   │   │   ├── MessageBubble.tsx   # Individual message with markdown rendering
│   │   │   ├── MessageStream.tsx   # Streaming message with incremental reveal
│   │   │   ├── ToolCallCard.tsx    # Inline tool call visualization
│   │   │   ├── ApprovalModal.tsx   # Approval gate for destructive actions
│   │   │   ├── ChatInput.tsx       # Multiline input with submit and file attach
│   │   │   └── ReasoningBlock.tsx  # Collapsible agent reasoning trace
│   │   │
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        # Root layout shell (sidebar + main)
│   │   │   ├── Sidebar.tsx         # Navigation + group switcher
│   │   │   ├── GroupSwitcher.tsx   # Group tabs or dropdown (main/ops/gws/boi)
│   │   │   ├── CommandPalette.tsx  # Global ⌘K command palette
│   │   │   └── ThemeToggle.tsx     # Dark/light mode toggle
│   │   │
│   │   ├── dashboard/
│   │   │   ├── GroupStatusCard.tsx # Per-group status summary card
│   │   │   ├── MultiGroupGrid.tsx  # 2x2 grid of group cards
│   │   │   └── AlertBanner.tsx     # Ops group alert surface
│   │   │
│   │   ├── boi/
│   │   │   ├── SpecTimeline.tsx    # Iteration timeline with task statuses
│   │   │   ├── TaskRow.tsx         # Single task row (status + actions)
│   │   │   └── WorkerLog.tsx       # Scrollable worker output log
│   │   │
│   │   ├── landings/
│   │   │   ├── LandingBoard.tsx    # Full L1-L4 kanban view
│   │   │   ├── LandingTierColumn.tsx
│   │   │   └── LandingItem.tsx     # Individual landing with inline edit
│   │   │
│   │   ├── memory/
│   │   │   ├── MemoryExplorer.tsx  # MEMORY.md tree browser
│   │   │   └── MemoryEntry.tsx     # Single memory card with search highlight
│   │   │
│   │   └── generative/             # Agent-rendered dynamic components
│   │       ├── GenerativeRenderer.tsx  # Resolves component type → React element
│   │       ├── AgentTable.tsx
│   │       ├── AgentChart.tsx
│   │       └── AgentForm.tsx
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useAgentRun.ts          # Start a run, track state, send inputs
│   │   ├── useAgentState.ts        # Batched StateDelta → Zustand (RAF-based)
│   │   ├── useStreamMessages.ts    # Message stream accumulation
│   │   ├── useToolApproval.ts      # Intercept tool calls needing approval
│   │   ├── useGroupStatus.ts       # Poll /api/groups for live status
│   │   ├── useSSE.ts               # Low-level SSE connection with reconnect
│   │   └── useCommandPalette.ts    # Keybinding + command registry
│   │
│   ├── store/                      # Zustand state slices
│   │   ├── index.ts                # Combined store (zustand createWithEqualityFn)
│   │   ├── chatStore.ts            # Messages, runs, thread history per group
│   │   ├── agentStore.ts           # AG-UI agent state (from StateSnapshot/Delta)
│   │   ├── groupStore.ts           # Group list, active group, group health
│   │   └── uiStore.ts              # Sidebar open, theme, command palette open
│   │
│   ├── api/                        # API client layer
│   │   ├── client.ts               # Base fetch wrapper with auth headers
│   │   ├── runs.ts                 # POST /api/run, POST /api/input/:runId
│   │   ├── groups.ts               # GET /api/groups
│   │   ├── stream.ts               # SSE connection factory (wraps useSSE)
│   │   └── types.ts                # API request/response TypeScript types
│   │
│   ├── lib/                        # Utilities (no side effects)
│   │   ├── agui-events.ts          # AG-UI event type discriminators + parsers
│   │   ├── json-patch.ts           # fast-json-patch apply wrapper
│   │   ├── markdown.ts             # react-markdown + remark-gfm config
│   │   ├── code-highlight.ts       # Shiki instance (singleton, lazy load)
│   │   └── generative-registry.ts  # Map of component name → React component
│   │
│   ├── mocks/                      # Development mock layer
│   │   ├── mock-agent.ts           # Mock SSE stream that replays fixture data
│   │   ├── fixtures/
│   │   │   ├── chat-session.json
│   │   │   ├── boi-spec-run.json
│   │   │   └── landings-update.json
│   │   └── msw-handlers.ts         # MSW request handlers for /api/* routes
│   │
│   ├── styles/
│   │   ├── globals.css             # Tailwind base + CSS variable tokens
│   │   └── themes/
│   │       ├── default.css         # Default NanoClaw brand tokens
│   │       └── dark.css            # Dark mode overrides
│   │
│   └── config/
│       ├── site.ts                 # Site name, description, nav links
│       └── groups.ts               # Group definitions (id, label, icon, color)
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json                 # shadcn/ui component registry config
└── package.json
```

---

## 2. Recommended Stack

### 2.1 Core Framework: Next.js 15 + App Router

**Reasoning:** Next.js App Router provides server components for fast initial load, route-level code splitting, and built-in support for streaming React Suspense. The `/app` directory naturally maps to NanoClaw's page model (chat per group, dashboard, BOI monitoring). Vite SPA was considered but Next.js wins on:

- Server components reduce JS shipped to client for data-heavy views (BOI spec, decision log)
- Built-in image optimization and font loading
- Zero-config TypeScript and Tailwind integration
- Native support for streaming UI via `Suspense` + `loading.tsx`

### 2.2 Component Library: shadcn/ui

**From t-1 evaluation (score 43.5/45):** Top-ranked framework. Key properties for NanoClaw:

- **Copy-paste ownership**: components live in `src/components/ui/`, fully customizable
- **Radix UI primitives**: best-in-class accessibility (WCAG 2.1 AA)
- **Tailwind CSS**: zero runtime style cost; safe for high-frequency AG-UI state updates
- **Dark mode**: 1-line toggle via `data-theme` attribute, no hydration mismatch
- **AI codegen friendly**: 111k GitHub stars means LLMs produce excellent shadcn code

**Add-ons required:**
- `react-markdown` + `remark-gfm` — markdown rendering in chat messages
- `shiki` — code block syntax highlighting (lazy-loaded, singleton)
- `recharts` (via shadcn Charts) — charts for landings, BOI metrics

### 2.3 State Management

Two distinct layers, each with the right tool:

| Layer | Tool | Why |
|-------|------|-----|
| **Local UI state** | Zustand | Minimal API, no boilerplate, excellent devtools, works with React 18 Concurrent mode |
| **AG-UI agent state** | AG-UI `StateSnapshot`/`StateDelta` via `useAgentState` hook | Agent is authoritative; local store mirrors agent-side state via JSON Patch |
| **Server state** | TanStack Query (React Query) | Caching, background refresh, optimistic updates for REST endpoints |
| **Form state** | React Hook Form + Zod | Validation, controlled inputs; shadcn form components use this natively |

**Zustand slice pattern:**
```typescript
// src/store/chatStore.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface ChatStore {
  threads: Record<GroupId, Thread>       // per-group message history
  runs: Record<RunId, RunState>          // active and completed runs
  activeGroup: GroupId
  setActiveGroup: (g: GroupId) => void
  appendMessage: (group: GroupId, msg: Message) => void
  updateRunState: (runId: RunId, patch: Partial<RunState>) => void
}

export const useChatStore = create<ChatStore>()(
  immer((set) => ({
    threads: {},
    runs: {},
    activeGroup: 'main',
    setActiveGroup: (g) => set((s) => { s.activeGroup = g }),
    appendMessage: (group, msg) => set((s) => {
      s.threads[group] ??= { messages: [] }
      s.threads[group].messages.push(msg)
    }),
    updateRunState: (runId, patch) => set((s) => {
      Object.assign(s.runs[runId] ??= {} as RunState, patch)
    }),
  }))
)
```

### 2.4 Routing: Next.js App Router

Route layout:

```
/                       → redirect to /chat/main
/chat/[group]           → ChatPanel for group (main, ops, gws, boi)
/dashboard              → MultiGroupGrid
/boi/[specId]           → SpecTimeline + WorkerLog
/landings               → LandingBoard
/memory                 → MemoryExplorer
/decisions              → Decision log table
/settings               → Settings (theme, auth token, group config)
```

Group-scoped chat layout (`src/app/chat/layout.tsx`) wraps all `/chat/*` routes in `AppShell` with `GroupSwitcher` so switching groups is instant (client navigation, no full reload).

### 2.5 TypeScript Configuration

```json
// tsconfig.json (key settings)
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 3. Key Components to Build

### 3.1 ChatPanel

**Purpose:** Core conversation interface for a single NanoClaw group.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  [Group: main ▾]              [Settings ⚙]          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [User message]                                     │
│  [Agent message with markdown + code block]         │
│  [ToolCallCard: read_file("src/types.ts")] ●live    │
│  [Agent message continues...]                       │
│  [ApprovalModal: "Send email to X?"] ← blocks       │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────┐ [Send ↵]    │
│  │ Type a message...                 │              │
│  └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Auto-scroll to bottom on new messages; user can scroll up to pause
- Streaming messages render via `MessageStream` (chunk-append with no full re-render)
- `ToolCallCard` appears inline at the exact position in the stream where the agent called the tool
- `ApprovalModal` rendered as a Sheet (shadcn) — full context, diff preview, approve/reject/edit

**shadcn components used:** `ScrollArea`, `Card`, `Sheet`, `Badge`, `Button`, `Textarea`, `Separator`

### 3.2 GroupSwitcher

**Purpose:** Switch active group with live status indicator.

```typescript
// src/components/layout/GroupSwitcher.tsx
const GROUPS = ['main', 'ops', 'gws', 'boi'] as const

export function GroupSwitcher() {
  const { activeGroup, setActiveGroup } = useChatStore()
  const { groupStatuses } = useGroupStatus()

  return (
    <Tabs value={activeGroup} onValueChange={setActiveGroup}>
      <TabsList>
        {GROUPS.map((g) => (
          <TabsTrigger key={g} value={g} className="gap-2">
            <StatusDot status={groupStatuses[g]?.health} />
            {g}
            {groupStatuses[g]?.activRuns > 0 && (
              <Badge variant="secondary">{groupStatuses[g].activeRuns}</Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
```

**shadcn components used:** `Tabs`, `TabsList`, `TabsTrigger`, `Badge`

### 3.3 Dashboard Layout (MultiGroupGrid)

**Purpose:** 2×2 card grid showing all groups simultaneously.

Each `GroupStatusCard` shows:
- Group name + health dot
- Last message summary (truncated)
- Active run indicator with progress bar
- Quick "open chat" link

**shadcn components used:** `Card`, `CardHeader`, `CardContent`, `Progress`, `Avatar`, `ScrollArea`

### 3.4 ToolApprovalModal

**Purpose:** Block agent run pending user approval for destructive actions.

```
┌──────────────────────────────────────────┐
│  Agent wants to: Send Email              │
│  ─────────────────────────────────────── │
│  To: alice@example.com                   │
│  Subject: Meeting recap                  │
│  ─────────────────────────────────────── │
│  Body preview:                           │
│  > Hi Alice,                             │
│  > Per our discussion...                 │
│  ─────────────────────────────────────── │
│  [Edit before sending]                   │
│  [Reject]        [Approve →]             │
└──────────────────────────────────────────┘
```

The modal receives the full `ToolCallArgs` from the AG-UI event and presents them in a structured format. After user action, it POSTs to `POST /api/input/:runId` with `{ type: "approval", approved: true/false, editedArgs: {...} }`.

**shadcn components used:** `Sheet`, `SheetContent`, `SheetHeader`, `Textarea`, `Button`, `Separator`, `Badge`

### 3.5 CommandPalette

**Purpose:** ⌘K global launcher for navigation, actions, and agent commands.

Built on shadcn `Command` (cmdk-based).

Command groups:
- **Navigate** — /dashboard, /boi, /landings, /memory
- **Switch group** — main, ops, gws, boi
- **Agent actions** — "Ask main agent", "Dispatch BOI spec", "Summarize today's emails"
- **Settings** — theme toggle, token config

```typescript
// src/components/layout/CommandPalette.tsx
export function CommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Navigate or ask an agent..." />
      <CommandList>
        <CommandGroup heading="Navigate">
          {NAV_COMMANDS.map((cmd) => (
            <CommandItem key={cmd.href} onSelect={() => router.push(cmd.href)}>
              {cmd.icon}
              {cmd.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Groups">
          {GROUPS.map((g) => (
            <CommandItem key={g} onSelect={() => handleGroupSwitch(g)}>
              {g}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

### 3.6 GenerativeRenderer

**Purpose:** Resolve AG-UI `CustomEvent` payloads to React components at runtime.

```typescript
// src/lib/generative-registry.ts
import { lazy } from 'react'

export const GENERATIVE_REGISTRY: Record<string, React.ComponentType<unknown>> = {
  'nanoclaw/table':  lazy(() => import('@/components/generative/AgentTable')),
  'nanoclaw/chart':  lazy(() => import('@/components/generative/AgentChart')),
  'nanoclaw/form':   lazy(() => import('@/components/generative/AgentForm')),
  'nanoclaw/diff':   lazy(() => import('@/components/generative/AgentDiff')),
  'nanoclaw/kanban': lazy(() => import('@/components/generative/AgentKanban')),
}

// src/components/generative/GenerativeRenderer.tsx
export function GenerativeRenderer({ event }: { event: CustomAGUIEvent }) {
  const Component = GENERATIVE_REGISTRY[event.name]
  if (!Component) return <UnknownComponentFallback name={event.name} />
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <Component {...event.value} />
    </Suspense>
  )
}
```

---

## 4. CopilotKit Integration

### 4.1 What CopilotKit Provides vs What We Build Custom

| Feature | CopilotKit | Custom | Notes |
|---------|-----------|--------|-------|
| SSE connection management | `useCopilotChat` | `useSSE` + `useAgentRun` | Build custom — our adapter has a non-standard auth + multi-group routing |
| Message rendering | `CopilotChat` UI | `ChatPanel` | Build custom — full control over streaming UX |
| Tool call interception | `useCopilotAction` | `useToolApproval` | Build custom — need approval modal, not just confirmation |
| State sync | `useCoAgent` | `useAgentState` | **Use CopilotKit** — `useCoAgent` handles `StateSnapshot`/`StateDelta` out of the box |
| Generative UI | `CopilotKitCustomEvent` | `GenerativeRenderer` | Hybrid — use CopilotKit's event API, custom registry for resolution |
| Suggestions | `useCopilotSuggestion` | — | **Use CopilotKit** — quick win, minimal effort |
| Readable state | `useCopilotReadable` | — | **Use CopilotKit** — tells agent what's on screen (landing state, active run, etc.) |

### 4.2 CopilotKit Setup

```typescript
// src/app/layout.tsx
import { CopilotKit } from '@copilotkit/react-core'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <CopilotKit
          runtimeUrl="/api/copilotkit"     // proxied to NanoClaw /api/run + /api/stream
          agent="nanoclaw"
        >
          <ThemeProvider>
            <CommandPalette />
            {children}
          </ThemeProvider>
        </CopilotKit>
      </body>
    </html>
  )
}
```

### 4.3 `useCoAgent` for Shared State

```typescript
// src/hooks/useAgentState.ts
import { useCoAgent } from '@copilotkit/react-core'

interface NanoclawAgentState {
  activeLandings: Landing[]
  pendingApprovals: ApprovalRequest[]
  boiSpecProgress: Record<string, SpecProgress>
  groupStatuses: Record<GroupId, GroupStatus>
}

export function useNanoclawState() {
  const { state, setState } = useCoAgent<NanoclawAgentState>({
    name: 'nanoclaw',
    initialState: {
      activeLandings: [],
      pendingApprovals: [],
      boiSpecProgress: {},
      groupStatuses: {},
    },
  })
  return { state, setState }
}
```

`useCoAgent` internally handles `STATE_SNAPSHOT` (full replace) and `STATE_DELTA` (JSON Patch apply) from the AG-UI stream. Our batched RAF reconciler (`useAgentState.ts`) wraps it to prevent jank on high-frequency deltas.

### 4.4 `useCopilotReadable` for Agent Context Awareness

```typescript
// src/app/landings/page.tsx
import { useCopilotReadable } from '@copilotkit/react-core'

export function LandingBoard() {
  const { state } = useNanoclawState()

  useCopilotReadable({
    description: 'Current daily landings status (L1-L4 tiers)',
    value: state.activeLandings,
  })

  // ... render LandingTierColumn components
}
```

This ensures when the user asks "what's the status of today's landings?" in the chat, the agent already has the current rendered state in context — no round-trip needed.

---

## 5. Development Workflow

### 5.1 Dev Server Setup

```bash
# Install
pnpm create next-app nanoclaw-ui --typescript --tailwind --app --src-dir
cd nanoclaw-ui
npx shadcn@latest init
npx shadcn@latest add button card dialog command sheet tabs skeleton badge scroll-area sonner

# Install core dependencies
pnpm add zustand immer @tanstack/react-query react-hook-form zod \
         @copilotkit/react-core @copilotkit/react-ui \
         react-markdown remark-gfm rehype-highlight \
         fast-json-patch sonner \
         @radix-ui/react-icons lucide-react

# Dev
pnpm dev
```

### 5.2 Mock Agent for Development Without NanoClaw

The `src/mocks/` layer enables full UI development without a running NanoClaw instance.

**Strategy:** Mock Service Worker (MSW) intercepts all `/api/*` requests and replays fixture JSON files that contain real AG-UI event sequences.

```typescript
// src/mocks/msw-handlers.ts
import { http, HttpResponse } from 'msw'
import chatFixture from './fixtures/chat-session.json'

export const handlers = [
  // POST /api/run → return a runId immediately
  http.post('/api/run', () =>
    HttpResponse.json({ runId: 'mock-run-001', streamUrl: '/api/stream/mock-run-001' })
  ),

  // GET /api/stream/:runId → stream fixture events as SSE
  http.get('/api/stream/:runId', async ({ params }) => {
    const stream = new ReadableStream({
      async start(controller) {
        for (const event of chatFixture.events) {
          await delay(event.delayMs ?? 50)
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        }
        controller.enqueue('data: {"type":"RUN_FINISHED"}\n\n')
        controller.close()
      },
    })
    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }),

  http.get('/api/groups', () =>
    HttpResponse.json({ groups: ['main', 'ops', 'gws', 'boi'] })
  ),
]
```

```typescript
// src/app/layout.tsx (dev only)
if (process.env.NODE_ENV === 'development') {
  const { worker } = await import('@/mocks/browser')
  await worker.start()
}
```

**Fixture files** capture real AG-UI event sequences including `TEXT_MESSAGE_CONTENT` streaming, `TOOL_CALL_START/ARGS/END`, `STATE_DELTA`, and `CUSTOM_EVENT`. These are generated once from a live NanoClaw run and committed to the repo.

### 5.3 Hot Reload

Next.js Fast Refresh works out of the box. For the mock layer:

- Changing a fixture JSON file → browser reload (Next.js detects asset changes)
- Changing MSW handlers → auto-reloaded by Vite HMR in MSW's browser integration

### 5.4 Local Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_BASE=http://localhost:4000    # NanoClaw HTTP server (when running locally)
NEXT_PUBLIC_MOCK_MODE=false                   # Set to 'true' to use MSW mocks
NANOCLAW_TOKEN=dev-token-local               # Server-side only: used in API route proxies
```

### 5.5 Storybook (Optional)

For isolated component development, Storybook + shadcn work well together. Not mandatory for MVP but recommended for `ToolApprovalModal`, `SpecTimeline`, and `LandingBoard` — components with complex state.

```bash
pnpm dlx storybook@latest init
```

---

## 6. Deployment Strategy

### 6.1 Recommended: Static Build Served by NanoClaw

**Architecture:**

```
┌─────────────────────────────────────────────────────┐
│                  NanoClaw HTTP server                │
│                                                     │
│  ┌─────────────────────────┐  ┌──────────────────┐  │
│  │  Static file server     │  │  AG-UI API routes │  │
│  │  (nanoclaw-ui/out/)     │  │  /api/run         │  │
│  │                         │  │  /api/stream/:id  │  │
│  │  GET /*   → index.html  │  │  /api/input/:id   │  │
│  │  GET /_next/* → assets  │  │  /api/groups      │  │
│  └─────────────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

NanoClaw adds a static file route handler that serves `next export` output alongside its existing API routes. This is the simplest deployment: one process, one port (e.g., `:4000`), zero external dependencies.

**Build command:**
```bash
# next.config.ts
export default { output: 'export', basePath: '/ui' }

# package.json
"scripts": {
  "build": "next build",
  "export": "next build && echo 'Static files in out/'"
}
```

The `out/` directory is committed or copied to NanoClaw's repo at `static/ui/`. NanoClaw serves it:

```typescript
// In NanoClaw's HTTP server setup
app.use('/ui', express.static(path.join(__dirname, '../static/ui')))
```

### 6.2 Alternative: Separate Next.js Server (Recommended for Development)

For full Next.js features (server components, API routes, ISR), run a separate Next.js server that proxies `/api/*` to NanoClaw:

```typescript
// src/app/api/run/route.ts (Next.js API route proxy)
export async function POST(req: Request) {
  const body = await req.json()
  const res = await fetch(`${process.env.NANOCLAW_BASE}/api/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NANOCLAW_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  return res
}
```

This keeps NanoClaw's token server-side and allows CORS-free operation. In production, deploy the Next.js app to a local network server (or the same machine as NanoClaw), not to a public CDN.

### 6.3 Build Pipeline

```yaml
# scripts/build-ui.sh
set -uo pipefail

cd nanoclaw-ui
pnpm install --frozen-lockfile
pnpm build

# Copy static output into NanoClaw repo
cp -r out/ ../hex-nanoclaw/static/ui/

echo "UI build complete. Deploy by restarting NanoClaw."
```

### 6.4 Deployment Environments

| Environment | Frontend | API | Auth | Notes |
|------------|----------|-----|------|-------|
| **Local dev** | `pnpm dev` (port 3000) | NanoClaw (port 4000) | Dev token in `.env.local` | MSW mocks available |
| **Local prod** | Static files via NanoClaw | NanoClaw (port 4000) | Token in NanoClaw config | Single process |
| **Remote** | Separate Next.js server | NanoClaw (localhost:4000) | Token stored server-side | Next.js proxies API |

### 6.5 Authentication in Deployment

From t-4 adapter design: authentication uses a bearer token passed in `Authorization` header. In deployment:

- **Local only:** token is `localhost-only` hardcoded; NanoClaw rejects requests from non-loopback IPs
- **Remote:** token is generated at NanoClaw startup, stored in `~/.boi/auth-token`, user copies it into browser settings on first visit
- **No OAuth/SSO needed for MVP** — NanoClaw is a personal tool

---

## Summary

| Concern | Solution |
|---------|---------|
| Framework | Next.js 15 App Router |
| Components | shadcn/ui (Radix + Tailwind) |
| State: UI | Zustand + Immer |
| State: Agent | CopilotKit `useCoAgent` + custom RAF batcher |
| State: Server | TanStack Query |
| Forms | React Hook Form + Zod |
| Dev mocks | MSW with AG-UI fixture files |
| Deployment | Static export served by NanoClaw HTTP server |
| Auth | Bearer token (local-first) |

The architecture is deliberately lean: no SSR complexity for MVP, no external auth system, one binary to run. The mock layer enables rapid UI development in complete isolation, and the static export means NanoClaw stays a single-process, self-contained tool.

---

## Decision Rationale: Next.js App Router vs Vite SPA

**Decision:** Use Next.js App Router instead of a Vite SPA.

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **Next.js App Router** | Server components, route-level splitting, Suspense streaming, static export | 4.3 |
| Vite SPA | Fast HMR, minimal config, simple mental model, no SSR overhead | 3.8 |
| Remix | Full-stack with loaders/actions, but opinionated on data fetching | 3.2 |

**Margin:** 4.3 vs 3.8 — moderate

**Key trade-off:** Next.js adds some complexity (server vs client component distinction) but delivers route-level code splitting and streaming Suspense for free — important for the BOI spec view and landings board that render large datasets. With `output: 'export'`, Next.js also produces a static bundle that Vite would, so we lose nothing in deployment simplicity.

**Assumptions that could change the verdict:**
- If NanoClaw's HTTP server cannot serve the `_next/static` nested path structure, Vite SPA (flat output) would be simpler
- If the team is already experienced with Vite, the Vite SPA would have faster initial developer ramp-up

**Dissenting view:** Vite SPA is simpler. The server/client component split in App Router creates subtle footguns (forgetting `'use client'`, importing server code into client components). For a personal tool used by one developer, the simplicity of Vite + React Router might outweigh Next.js's features.

---

## Decision Rationale: Zustand vs Jotai for Local State

**Decision:** Use Zustand over Jotai.

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **Zustand** | Single store with slices, excellent devtools, compatible with Immer for immutable patches | 4.5 |
| Jotai | Atomic model (fine-grained re-renders), great for isolated atoms but more complex for cross-slice logic | 3.5 |
| Redux Toolkit | Battle-tested, DevTools are best-in-class, but verbose for this scale | 2.5 |

**Margin:** 4.5 vs 3.5 — moderate

**Key trade-off:** Zustand's slice model maps directly to NanoClaw's groups (one slice per group thread). Jotai's atom model is better for highly granular subscriptions but requires more plumbing when atoms need to share logic (e.g., updating an approval state from the tool call received in the chat store).

**Assumptions that could change the verdict:**
- If the UI grows to 20+ fine-grained reactive surfaces (e.g., per-landing-item real-time tracking), Jotai's atomic granularity would reduce unnecessary re-renders

**Dissenting view:** Jotai's atomic model would eliminate the need for the RAF batching workaround entirely — each delta could update only the affected atom without triggering broad re-renders. Worth revisiting if StateDelta performance becomes a bottleneck in practice.
