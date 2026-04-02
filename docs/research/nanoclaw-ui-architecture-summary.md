# NanoClaw AG-UI: Executive Architecture Summary

> Synthesized from q-373 research (t-1 through t-5) | Written by BOI worker, iteration 6 | 2026-04-01

---

## Table of Contents

1. [Recommended Component Framework](#1-recommended-component-framework)
2. [Top 3 Use Cases to Build First](#2-top-3-use-cases-to-build-first)
3. [Architecture Overview](#3-architecture-overview)
4. [Implementation Roadmap](#4-implementation-roadmap)
5. [Risk Assessment](#5-risk-assessment)
6. [Slack-Only vs AG-UI Enhanced Comparison](#6-slack-only-vs-ag-ui-enhanced-comparison)

---

## 1. Recommended Component Framework

### Winner: shadcn/ui

**Summary verdict:** shadcn/ui is the clear choice for NanoClaw's AG-UI frontend. It scored **43.5/45** across 9 evaluation criteria — significantly ahead of the runner-up (Mantine, 38.5/45). Its combination of Radix UI primitives, Tailwind CSS, and copy-paste ownership model makes it uniquely suited for an agentic UI that must be customized freely, handle streaming updates without jank, and remain maintainable over time.

### Framework Scorecard

| Framework | Coverage | Streaming | Theming | Bundle | React | A11y | Community | Composability | AG-UI | **Total** |
|-----------|:--------:|:---------:|:-------:|:------:|:-----:|:----:|:---------:|:-------------:|:-----:|:---------:|
| **shadcn/ui** | 4.5 | 4.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | **43.5** |
| Mantine | 5.0 | 4.5 | 4.0 | 3.5 | 5.0 | 4.0 | 4.0 | 3.5 | 4.0 | **37.5** |
| Chakra UI | 4.0 | 3.5 | 4.5 | 3.0 | 4.5 | 5.0 | 3.5 | 4.5 | 4.0 | **36.5** |
| MUI | 4.5 | 2.5 | 3.5 | 2.5 | 5.0 | 4.5 | 5.0 | 3.0 | 3.5 | **34.0** |
| Ant Design | 5.0 | 2.5 | 3.5 | 2.0 | 5.0 | 3.5 | 4.5 | 3.0 | 3.0 | **32.0** |
| Radix UI Themes | 3.0 | 4.0 | 4.0 | 4.5 | 5.0 | 5.0 | 3.5 | 4.0 | 4.5 | **37.5** |
| Park UI / Ark UI | 3.5 | 4.0 | 4.5 | 4.5 | 5.0 | 5.0 | 2.5 | 4.5 | 4.0 | **37.5** |
| AgnosticUI | 2.5 | 3.0 | 3.0 | 4.0 | 4.0 | 4.0 | 1.5 | 3.0 | 3.5 | **28.5** |

### Why shadcn/ui Wins

**1. Zero runtime overhead for streaming.** Tailwind CSS is static — no runtime style recalculation during rapid AG-UI `STATE_DELTA` events. MUI and Ant Design use CSS-in-JS engines that recalculate styles on every state change, causing visible jank at 30–100 Hz update rates.

**2. You own the code.** Components are installed into your codebase via CLI, not installed as an npm package. This means streaming-optimized variants (e.g., a `MessageStream` component that appends chunks without re-mounting) are trivial to build by modifying the installed source — no subclassing or wrapping an opaque library.

**3. Radix UI primitives underneath.** Every interactive component (Dialog, DropdownMenu, Command, etc.) is built on Radix UI primitives, which provide best-in-class WAI-ARIA accessibility, focus management, and keyboard navigation — meeting WCAG 2.1 AA out of the box.

**4. LLM-friendly.** With 111k GitHub stars, shadcn/ui has the largest community and the deepest AI training data coverage of any library evaluated. Claude and other LLMs generate excellent shadcn code. This matters for NanoClaw, where the agent runtime itself may generate or modify UI components.

**5. CopilotKit integrates cleanly.** CopilotKit is a pure React library with no styling opinions. Its AG-UI event wiring (`useCopilotChat`, `useCoAgent`) composes directly with shadcn components — swap CopilotKit's default UI for shadcn equivalents and get full visual consistency.

### Required Addons (not in shadcn core)

| Need | Library | Size | Notes |
|------|---------|------|-------|
| Markdown rendering | `react-markdown` + `remark-gfm` | ~45KB | Safe HTML, GFM tables/strikethrough |
| Syntax highlighting | `shiki` | ~8KB (WASM) | Server-side tokenization, zero client bundle |
| JSON Patch | `fast-json-patch` | ~3KB | RFC 6902 compliant, immutable mode |
| State management | `zustand` + `immer` | ~8KB | Per-group stores, minimal boilerplate |
| Diff preview | `react-diff-viewer-continued` | ~25KB | Tool approval modal diffs |
| Form validation | `zod` + `react-hook-form` | ~20KB | Generative UI prop safety |

**Total addons:** ~109KB before tree-shaking. All are best-in-class for their category.

### Runner-Up: Mantine

Mantine (score 37.5) is the strongest alternative. It ships first-party code highlighting (`@mantine/code-highlight`), charts (`@mantine/charts`), and a rich text editor (`@mantine/tiptap`) — reducing addon count. The trade-offs: larger baseline bundle, non-zero native CSS runtime overhead, and smaller community (30k vs 111k stars). If code ownership is undesirable (team prefers a managed library), Mantine is the right fallback.

---

## 2. Top 3 Use Cases to Build First

These three use cases are ordered by **value-to-effort ratio**: they unlock the core NanoClaw workflow, are achievable in Phase 1 (MVP), and produce visible, usable results immediately.

### Priority 1: Interactive Hex Session (UC-1)

**Why first:** This is NanoClaw's primary value proposition — a better interface for hex conversations than Slack. Every user interaction starts here. Building it first validates the entire AG-UI stack end-to-end.

**What it delivers:**
- Full chat panel with streaming markdown rendering and code blocks
- Inline tool call cards (file reads, web searches, bash commands)
- Approval gate for destructive operations
- Keyboard-driven (Cmd+K command palette, Enter to submit)

**Key components:** `ChatPanel`, `MessageStream`, `ToolCallCard`, `ApprovalModal`, `ChatInput`, `ScrollArea`

**AG-UI events exercised:** `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `CUSTOM` (approval), `RUN_STARTED/FINISHED`

**Effort estimate:** 5–7 days (2 engineers). Most complexity is in `MessageStream` + tool card timing.

---

### Priority 2: Tool Approval Flow (UC-5)

**Why second:** Approvals are the highest-risk interaction in the system. Getting the UX right early prevents bad patterns from calcifying. This use case also serves as a forcing function for the AG-UI adapter's `CUSTOM` event handling and the `/api/input/:runId` endpoint.

**What it delivers:**
- Structured approval form with full context (tool name, args, impact summary)
- Diff preview for file edits and email composition
- Approve / Reject / Edit options
- Approval queue for multi-group concurrent approval requests

**Key components:** `ApprovalModal` (Sheet), `DiffPreview`, `Badge` (severity), `Button` (approve/reject/edit), `ApprovalQueue` sidebar indicator

**AG-UI events exercised:** `STATE_SNAPSHOT` (pending approval), `CUSTOM` (approval_request), `POST /api/input` (approval response)

**Effort estimate:** 3–4 days. Sheet layout + diff renderer are the main work.

---

### Priority 3: Multi-Group Dashboard (UC-2)

**Why third:** Once the chat panel works, the dashboard makes NanoClaw's multi-group architecture visible. It surfaces the ops/gws/boi groups that users currently have no visibility into from Slack. It also exercises multi-group SSE coordination — the most architecturally novel part of the system.

**What it delivers:**
- 2×2 grid of group status cards (main, ops, gws, boi)
- Live connection status per group
- BOI spec progress (current task, iteration count)
- GWS calendar/email summary surfaced as cards
- Ops alert banner for any active issues

**Key components:** `MultiGroupGrid`, `GroupStatusCard`, `AlertBanner`, `Progress`, `Badge`, `Card`

**AG-UI events exercised:** `STATE_DELTA` from all 4 groups simultaneously, multi-group rAF batching

**Effort estimate:** 4–5 days. Multi-group SSE management (4 concurrent `EventSource` instances) is the hard part.

---

## 3. Architecture Overview

### System Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js SPA)                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Pages: /chat/[group]  /dashboard  /boi/[specId]  /landings     │    │
│  │         /memory  /decisions  /settings                           │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│  ┌──────────────────────────────▼──────────────────────────────────┐    │
│  │  Component Layer (shadcn/ui)                                     │    │
│  │  ChatPanel · ToolCallCard · ApprovalModal · MultiGroupGrid       │    │
│  │  SpecTimeline · LandingBoard · MemoryExplorer · DecisionLog      │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│  ┌──────────────────────────────▼──────────────────────────────────┐    │
│  │  State & Event Layer                                             │    │
│  │  Zustand stores (per-group + shared)                             │    │
│  │  rAF batch flusher · JSON Patch applier · Optimistic updates     │    │
│  │  Generative UI registry · Error recovery / reconnect logic       │    │
│  └───────────────┬──────────────────────────────┬───────────────────┘    │
│                  │ POST /api/run                │ GET /api/stream/:runId  │
│                  │ POST /api/input/:runId        │ (SSE, 4 × groups)      │
└──────────────────┼──────────────────────────────┼────────────────────────┘
                   │                              │
┌──────────────────▼──────────────────────────────▼────────────────────────┐
│  NanoClaw HTTP Server (hex-nanoclaw)                                      │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  AG-UI Channel Adapter                                           │    │
│  │  POST /api/run  →  RunRegistry  →  ContainerRunner               │    │
│  │  GET  /api/stream/:runId  →  SSE emitter (per group)             │    │
│  │  POST /api/input/:runId   →  chatJid routing                     │    │
│  └──────────────────────┬───────────────────────────────────────────┘    │
│                         │                                                 │
│  ┌──────────────────────▼───────────────────────────────────────────┐    │
│  │  Container Runtime                                               │    │
│  │  main  │  ops  │  gws  │  boi   ← isolated containers           │    │
│  │  stdout → AG-UI event translator (TEXT_*, TOOL_CALL_*, CUSTOM)   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  Slack Channel (existing, unchanged)                              │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

**Chat request (happy path):**
```
User types message
  → POST /api/run { group, message, threadId }
  ← { runId, streamUrl }
  → GET /api/stream/:runId (EventSource opened)
  ← RUN_STARTED
  ← TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT (×N) / TEXT_MESSAGE_END
  ← TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END / TOOL_CALL_RESULT (×M)
  ← RUN_FINISHED
```

**State sync:**
```
Agent emits STATE_DELTA (JSON Patch ops)
  → rAF batcher queues ops
  → requestAnimationFrame fires (≤16ms later)
  → all queued ops applied via fast-json-patch (immutable)
  → single React setState → single re-render
```

**Approval gate:**
```
Agent emits CUSTOM { name: "approval_request", value: { tool, args, impact } }
  → ApprovalModal opens (Sheet)
  → user reviews + clicks Approve
  → POST /api/input/:runId { type: "approval", decision: "approved" }
  → agent receives approval → continues run
```

### Technology Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | SSR for fast initial load; file-based routing maps cleanly to NanoClaw's views |
| Components | shadcn/ui + Radix primitives | Copy-paste ownership; zero streaming jank; best a11y |
| Styling | Tailwind CSS v4 | Static; dark mode via `.dark` class toggle |
| State (local) | Zustand + immer | Minimal boilerplate; per-group slice isolation |
| State (agent) | AG-UI `STATE_DELTA` + rAF batcher | Handles 30–100 Hz patch rate without jank |
| AG-UI client | CopilotKit hooks + custom `EventSource` | CopilotKit for standard flows; raw SSE for multi-group dashboard |
| Markdown | react-markdown + remark-gfm | Battle-tested; safe HTML; GFM support |
| Code highlight | shiki (WASM) | Zero client bundle; accurate token colors |
| Forms | react-hook-form + zod | Type-safe validation; generative UI prop safety |
| HTTP | Native `fetch` + `EventSource` | No extra HTTP library needed |

---

## 4. Implementation Roadmap

### Phase 1: MVP (2–3 weeks)

**Goal:** A working AG-UI chat interface for the `main` group. Replaces Slack for interactive hex conversations.

**Deliverables:**
- [ ] AG-UI channel adapter in hex-nanoclaw (`POST /api/run`, `GET /api/stream/:runId`, `POST /api/input/:runId`)
- [ ] Container stdout → AG-UI event translator (text chunks, tool calls)
- [ ] Basic auth (local token, environment variable)
- [ ] Next.js project scaffolded with shadcn/ui, Zustand, Tailwind dark mode
- [ ] `ChatPanel` with streaming message rendering (chunk-append, markdown on complete)
- [ ] `ToolCallCard` — inline tool call visualization (streaming args → running → result)
- [ ] `ApprovalModal` — structured approval gate for destructive tool calls
- [ ] `ChatInput` — multiline textarea, Enter to submit, Cmd+Enter for newline
- [ ] `GroupSwitcher` — tabs for main/ops/gws/boi (basic, non-real-time)
- [ ] SSE reconnection with exponential backoff
- [ ] Deployment: `next build` → static export served by NanoClaw's HTTP server

**Definition of done:** User can open `localhost:3000`, chat with main group, see streaming markdown with code blocks, approve/reject tool calls, and have the experience feel faster and richer than Slack.

**Risks in Phase 1:**
- Container stdout parsing is the highest-risk item — IPC format may need iteration
- SSE CORS / auth token flow needs to be confirmed with NanoClaw's HTTP server

---

### Phase 2: Feature-Rich (4–6 weeks)

**Goal:** Cover the full NanoClaw surface area. All 4 groups active. Dashboard live. BOI spec monitoring working.

**Deliverables:**
- [ ] Multi-group SSE (4 concurrent `EventSource` instances, per-group rAF queues)
- [ ] `MultiGroupDashboard` — 2×2 live status grid
- [ ] `BOISpecMonitor` — real-time task/iteration timeline for a running spec
- [ ] `LandingBoard` — L1–L4 tier view with optimistic status edits
- [ ] `MemoryExplorer` — browse per-group MEMORY.md and shared context files
- [ ] `DecisionLog` — searchable, filterable decision record table
- [ ] `EvolutionEngineUI` — observation/changelog browser, approve/reject proposals
- [ ] `MeetingPrepDoc` — inline edit with agent refinement loop
- [ ] Generative UI registry (agent-driven component rendering via `CUSTOM` event)
- [ ] `CommandPalette` (Cmd+K) — group switch, jump to spec, search decisions
- [ ] `FileBrowser` — directory tree with agent annotations
- [ ] Sequence number gap detection + `STATE_SNAPSHOT` fallback
- [ ] `@mantine/charts`-equivalent charts via Recharts (shadcn Charts component)
- [ ] Settings panel — auth token, theme, default group

**Definition of done:** All 10 use cases from t-2 are demonstrable in the running UI.

---

### Phase 3: Polish (2–4 weeks)

**Goal:** Production-quality UX. Fast, delightful, reliable under real workloads.

**Deliverables:**
- [ ] Virtual list for long message histories (react-virtual)
- [ ] Persistent chat history (IndexedDB or server-side SQLite)
- [ ] Keyboard shortcut help overlay (?)
- [ ] Mobile-usable responsive layout (sidebar collapses to bottom nav)
- [ ] Toast notifications for group status changes, spec completions, errors
- [ ] Accessibility audit — axe-core scan, keyboard-only walkthrough, screen reader test
- [ ] Animation polish — fade-in for new messages, slide-in for tool cards, skeleton loaders
- [ ] Performance profiling — React DevTools, Lighthouse, verify 60fps during STATE_DELTA bursts
- [ ] End-to-end testing (Playwright) for critical flows: chat, approval, group switch
- [ ] Documentation: setup guide, architecture notes, adding new generative components

**Definition of done:** Lighthouse performance score ≥ 85, zero axe-core critical violations, E2E tests green for 5 core flows.

---

## 5. Risk Assessment

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|:----------:|:------:|-----------|
| R1 | Container stdout format doesn't cleanly map to AG-UI events | High | High | Prototype the translator in Phase 1 day 1; IPC format may need structured JSON output mode |
| R2 | CopilotKit multi-group support requires workaround | Medium | Medium | Use raw `EventSource` for multi-group; CopilotKit only for single-group chat flows |
| R3 | NanoClaw's HTTP server doesn't support SSE keep-alive / long connections | Medium | High | Verify server timeout config early; may need Nginx proxy or ASGI/uWSGI tuning |
| R4 | Rapid `STATE_DELTA` events cause visible jank even with rAF batching | Low | Medium | Benchmark rAF batcher with synthetic 100Hz patch stream before Phase 2 ships |
| R5 | shadcn/ui component gaps require significant custom work | Low | Low | Mantine is a ready drop-in for any gap; addons (react-markdown, shiki) are trivial |
| R6 | Auth model is insufficient for multi-user access | Low | High | Phase 1 is local-only (localhost token); multi-user auth is explicitly out of scope until needed |
| R7 | Next.js static export conflicts with SSE streaming endpoints | Medium | High | Use Next.js API routes for `/api/*` (not static export); or separate Node.js adapter server |

### Critical Path

The **container stdout → AG-UI translator** (R1) is the single highest-risk item. It's the bridge between NanoClaw's existing runtime and the new UI layer. If the container output format is irregular or interleaved, all downstream UI work is affected. Recommendation: spike this in week 1, before any UI work begins.

### Mitigation for R7 (Static Export vs SSE)

Next.js `next export` disables API routes. Two options:
1. **Use `next start`** (Node.js server mode) — API routes work, SSE works natively. NanoClaw serves the Next.js process on a port.
2. **Separate adapter server** — NanoClaw's existing HTTP server handles `/api/*`; Next.js serves only the static frontend from `/`. CORS between them.

**Recommendation:** Option 1 (next start). Simplest, most reliable.

---

## 6. Slack-Only vs AG-UI Enhanced Comparison

| Capability | Slack Only | AG-UI Enhanced | Delta |
|-----------|:----------:|:--------------:|:-----:|
| **Chat interface** | Slack DMs / channel messages | Dedicated web chat panel | Major upgrade |
| **Streaming output** | Chunked edits to single message | Real-time chunk-by-chunk render | Major upgrade |
| **Markdown rendering** | Slack's limited markdown | Full GFM + syntax-highlighted code blocks | Major upgrade |
| **Tool call visibility** | Text descriptions only ("I searched for X") | Inline tool cards with args, status, results | Major upgrade |
| **Approval UX** | "Reply 'yes' to approve" text prompt | Structured modal with diff preview and one-click approve/reject | Major upgrade |
| **Multi-group view** | 4 separate Slack channels, manual switching | Single dashboard with live status for all 4 groups | New capability |
| **BOI spec monitoring** | No visibility (log files only) | Real-time task timeline, iteration progress, worker logs | New capability |
| **Landings dashboard** | Slack message, manually updated | Live board with optimistic edits, agent-confirmed updates | New capability |
| **Memory/context browser** | Not possible | Browse all MEMORY.md files, search, see relevance | New capability |
| **Decision log** | Not possible | Searchable structured decision records | New capability |
| **Evolution engine UI** | Not possible | Browse observations, approve/reject improvements | New capability |
| **Generative UI** | Not possible | Agent renders charts, tables, forms dynamically | New capability |
| **Keyboard shortcuts** | Slack shortcuts only | Cmd+K palette, group switch, jump to spec | Improvement |
| **Mobile access** | Full Slack mobile app | Desktop-first web UI (mobile-usable in Phase 3) | Tradeoff |
| **Notification delivery** | Slack push notifications | Browser notifications (requires setup) or Slack hybrid | Gap (Phase 3) |
| **Auth / access control** | Slack workspace auth | Local token (Phase 1), full auth in Phase 3 | Gap initially |
| **Reliability** | Slack uptime SLA | NanoClaw local server (no SLA, dev machine) | Tradeoff |

### Summary

The AG-UI frontend is not a replacement for Slack — it's a **specialist interface** for power-user NanoClaw interactions. Slack remains the right channel for:
- Mobile notifications
- Async check-ins while away from computer
- Integration with other Slack-native workflows

The AG-UI frontend is superior for:
- Active working sessions with hex (streaming, tool visibility, approvals)
- Monitoring long-running specs (BOI, landings)
- Exploring state the agent has accumulated (memory, decisions)
- Anything requiring structured UI (diffs, charts, forms)

The two channels are **additive** — the AG-UI adapter coexists with Slack on the same NanoClaw container runtime, and users can choose which to use for any given interaction.

---

## Decision Rationale: Framework Selection

**Decision:** shadcn/ui over Mantine as primary component framework

| Option | Description | Score (1-5) |
|--------|-------------|:-----------:|
| **shadcn/ui** | Copy-paste Radix + Tailwind; zero runtime; owned code | 4.8 |
| Mantine | Managed npm library; 120+ components; first-party charts/code-highlight | 4.2 |
| MUI | Most enterprise-complete; CSS-in-JS streaming jank; large bundle | 3.0 |
| Ant Design | Data-heavy focus; CSS-in-JS jank; aesthetic mismatch | 2.8 |

**Margin:** 4.8 vs 4.2 — moderate

**Key trade-off:** shadcn/ui has ~10 fewer first-party components than Mantine (no built-in code highlight, no Tiptap WYSIWYG, no first-party charts), requiring addons. The owned-code model and streaming performance advantage outweigh this.

**Assumptions that could change the verdict:**
- If NanoClaw UI grows a team that prefers "don't touch component internals" — Mantine's managed model becomes an advantage
- If bundle size becomes a non-issue (e.g., served on local network only) — Mantine's heavier bundle is irrelevant

**Dissenting view:** Mantine v8 is genuinely feature-complete and would require fewer addons. For a solo developer project like NanoClaw, the "you own the code" benefit of shadcn/ui is less meaningful — the operator is also the only person maintaining it.

---

*End of executive summary. Research outputs: t-1 → t-5 docs in ~/mrap-hex/raw/research/. Implementation begins with Phase 1 spike on container stdout → AG-UI translator.*
