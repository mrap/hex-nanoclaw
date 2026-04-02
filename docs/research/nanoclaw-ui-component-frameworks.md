# NanoClaw UI Component Framework Evaluation

> Research doc for spec q-373 | Written by BOI worker, iteration 1 | 2026-04-01

---

## Overview

This document evaluates 9 React component frameworks for NanoClaw's AG-UI channel adapter. Each framework is scored on 9 criteria critical for an agentic UI that handles streaming AG-UI events at high frequency.

**Evaluation criteria:**
1. **Coverage** — component breadth: forms, tables, modals, toasts, menus, command palette, markdown, code blocks, charts
2. **Streaming** — how well the framework handles rapid DOM updates (AG-UI StateDelta events)
3. **Theming** — dark mode, custom tokens, CSS approach
4. **Bundle size** — download cost and tree-shakeability
5. **React compat** — React 18+ support (required)
6. **Accessibility** — ARIA patterns, keyboard navigation (WCAG 2.1 AA target)
7. **Community** — GitHub stars, npm downloads, maintenance cadence
8. **Composability** — can components be combined for novel layouts?
9. **AG-UI compat** — works alongside CopilotKit and AG-UI event consumers

**Scoring: 1 (poor) → 5 (excellent)**

---

## Frameworks Evaluated

### 1. shadcn/ui

**What it is:** A collection of copy-paste React components built on Radix UI primitives + Tailwind CSS. No npm package — components are installed into your codebase via a CLI. You own the code.

**Homepage:** https://ui.shadcn.com  
**GitHub stars:** ~111,000  
**npm downloads:** N/A (copy-paste, no runtime package)

#### Component Coverage

| Category | Component | Available? |
|----------|-----------|-----------|
| Forms | Input, Select, Checkbox, Radio, Switch, Slider, DatePicker | ✅ Yes |
| Tables | DataTable (via TanStack Table integration) | ✅ Yes |
| Modals | Dialog, Sheet, AlertDialog, Drawer | ✅ Yes |
| Toasts | Toast (via Sonner) | ✅ Yes |
| Menus | DropdownMenu, ContextMenu, Menubar, NavigationMenu | ✅ Yes |
| Command palette | Command (built-in component, cmdk-based) | ✅ Yes |
| Markdown rendering | No built-in (add `react-markdown` + `remark-gfm`) | ⚠️ Addon |
| Code blocks | No built-in (add `shiki` or `react-syntax-highlighter`) | ⚠️ Addon |
| Charts | Charts (via Recharts, full chart component suite) | ✅ Yes |
| Data exploration | Calendar, Carousel, Skeleton | ✅ Yes |
| Multi-select / Combobox | Combobox (built-in) | ✅ Yes |
| Progress / Loading | Progress, Skeleton | ✅ Yes |
| Notifications | Badge, Alert, Toast | ✅ Yes |

**Total: ~80 components** + first-party addons for charts and data tables. Markdown and code blocks require 2 addons (react-markdown + shiki), both trivial to add.

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 4.5 | 80+ components, command palette ✓, charts ✓, data tables ✓; markdown/code need addons |
| Streaming | 4.0 | Tailwind CSS + Radix = no runtime style recalc; copy-paste means streaming components are trivial to build custom |
| Theming | 5.0 | CSS variables + Tailwind config; 1-line dark mode toggle; design token support; 50+ community color themes |
| Bundle size | 5.0 | Zero runtime dependency overhead — you only ship components you actually install |
| React compat | 5.0 | Explicit React 19 + Next.js 15 support in docs |
| Accessibility | 5.0 | Radix UI primitives underneath — best-in-class WAI-ARIA, keyboard nav, focus management |
| Community | 5.0 | 111k GitHub stars — largest UI library community; deep AI training data means LLMs write excellent shadcn code |
| Composability | 5.0 | You own the code; compose and mutate freely; no abstraction layers to fight |
| AG-UI compat | 5.0 | React-based; no framework conflicts; CopilotKit, Zustand, and AG-UI client integrate cleanly |
| **Total** | **43.5** | |

---

### 2. Mantine

**What it is:** A comprehensive "batteries-included" React component library with 120+ components, 70 hooks, and first-party packages for charts, rich text editing, code highlighting, dates, and forms. Uses native CSS (no CSS-in-JS runtime).

**Homepage:** https://mantine.dev  
**GitHub stars:** ~30,000  
**npm downloads:** ~5M/month

#### Component Coverage

| Category | Component | Available? |
|----------|-----------|-----------|
| Forms | TextInput, Select, Checkbox, Radio, Switch, DatePicker, TimePicker, RangeSlider | ✅ Yes |
| Tables | Table (built-in) | ✅ Basic |
| Modals | Modal, Drawer, Popover, HoverCard | ✅ Yes |
| Toasts | Notifications (`@mantine/notifications`) | ✅ Yes |
| Menus | Menu (with submenus in v8), ActionIcon, Spotlight | ✅ Yes |
| Command palette | Spotlight (`@mantine/spotlight`) — full command palette | ✅ Yes |
| Markdown rendering | No built-in (addon needed) | ⚠️ Addon |
| Code blocks | CodeHighlight (`@mantine/code-highlight`) — Shiki/highlight.js adapters | ✅ Yes |
| Charts | `@mantine/charts` — AreaChart, BarChart, LineChart, PieChart, Heatmap, Sparkline | ✅ Yes |
| Rich text editor | `@mantine/tiptap` — Tiptap-based WYSIWYG | ✅ Yes |
| Progress / Loading | Progress, Loader, Skeleton, RingProgress | ✅ Yes |
| Notifications | Notification, Badge, Alert | ✅ Yes |

**Total: 120+ components** across the core and extension packages. Most comprehensive single-install library evaluated. v8 adds TimePicker, TimeGrid, Heatmap, Menu submenus.

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 4.5 | 120+ components, Spotlight (command palette) ✓, CodeHighlight ✓, Charts ✓; no markdown renderer but everything else is built-in |
| Streaming | 4.5 | Native CSS (no emotion/styled-components runtime) = zero style recalc overhead; ideal for high-frequency AG-UI StateDelta events |
| Theming | 5.0 | CSS variables everywhere; dark mode on every component by default; PostCSS preset; responsive + RTL support |
| Bundle size | 4.0 | Tree-shakeable; `@mantine/form` is 6.3kb gzipped; full suite heavier than shadcn but modular |
| React compat | 5.0 | React 18+ (hooks-first from day one) |
| Accessibility | 4.0 | Good ARIA coverage; not as rigorous as Radix-based libraries but well-tested |
| Community | 4.0 | 30k stars, 5M monthly downloads, 500+ contributors, 12k Discord — active and healthy |
| Composability | 4.5 | Strong hooks library (`useForm`, `useDisclosure`, `useHotkeys`, etc.) enables complex compositions |
| AG-UI compat | 5.0 | Pure React, no framework conflicts; CopilotKit integrates cleanly; native CSS avoids SSR hydration issues |
| **Total** | **40.5** | |

---

### 3. Radix UI (Themes + Primitives)

**What it is:** Two-layer library. **Radix Primitives** (~60 headless accessible components). **Radix Themes** adds polished default styling on top. shadcn/ui is built on Radix Primitives. Made by WorkOS.

**Homepage:** https://www.radix-ui.com  
**GitHub stars:** ~15,000 (Themes), ~14,000 (Primitives)  
**npm downloads:** ~40M/month (@radix-ui/react-*)

#### Component Coverage

| Category | Component | Available? |
|----------|-----------|-----------|
| Forms | TextField, Select, Checkbox, Switch, Slider, RadioGroup | ✅ Yes (Themes) |
| Tables | Table (Themes) | ✅ Basic |
| Modals | Dialog, AlertDialog, Sheet | ✅ Yes |
| Toasts | Toast (Primitives only — no built-in styled toast in Themes) | ⚠️ Primitives |
| Menus | DropdownMenu, ContextMenu, NavigationMenu, Menubar | ✅ Yes |
| Command palette | None | ❌ No |
| Markdown rendering | None | ❌ No |
| Code blocks | None | ❌ No |
| Charts | None | ❌ No |

**Total: ~30 Themes components** (polished), 60 Primitives (unstyled). Major gaps: no command palette, no charts, no code blocks, no markdown.

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 3.0 | Limited out-of-box; strong foundation but gaps in charts, command palette, code blocks |
| Streaming | 4.5 | CSS variables only; no runtime style overhead; very clean for rapid updates |
| Theming | 5.0 | Best-in-class CSS variables implementation; semantic token system |
| Bundle size | 3.5 | Moderate; Themes adds weight on top of Primitives |
| React compat | 5.0 | React 18+ |
| Accessibility | 5.0 | WAI-ARIA specification compliance is the founding reason for Radix |
| Community | 3.5 | Smaller than shadcn/ui or MUI, but very high quality; npm downloads are very high (shadcn effect) |
| Composability | 5.0 | The literal foundation for shadcn/ui — maximum composability by design |
| AG-UI compat | 5.0 | No conflicts; pure primitives |
| **Total** | **39.5** | |

---

### 4. Park UI

**What it is:** Pre-styled component layer on top of Ark UI (state machine-powered headless components) + Panda CSS (build-time CSS extraction). Beautiful out of the box with 30+ accent colors, 5 gray palettes, 7 border radius scales. Official Chakra UI partnership.

**Homepage:** https://park-ui.com  
**GitHub stars:** ~2,500  
**npm downloads:** Small

#### Component Coverage

| Category | Component | Available? |
|----------|-----------|-----------|
| Forms | Input, Select, Checkbox, Switch, Radio, Slider, DatePicker | ✅ Yes |
| Tables | Table | ✅ Basic |
| Modals | Dialog, Drawer, Popover | ✅ Yes |
| Toasts | Toast | ✅ Yes |
| Menus | Menu, Context Menu | ✅ Yes |
| Command palette | None built-in | ❌ No |
| Markdown rendering | None | ❌ No |
| Code blocks | None | ❌ No |
| Charts | None | ❌ No |

**Total: ~45 components** (inherits Ark UI's suite). Beautiful polish; major gaps in data visualization and developer-tools components.

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 3.5 | Ark UI's ~45 components, nicely styled; missing charts, command palette, code blocks |
| Streaming | 4.5 | Panda CSS = build-time extraction (zero runtime) + Ark UI state machines = reliable for rapid updates |
| Theming | 5.0 | Most granular theming system evaluated: 30+ accent colors, 5 grays, 7 radii — best "polished out of box" |
| Bundle size | 4.0 | Panda CSS build-time extraction = minimal runtime CSS overhead |
| React compat | 5.0 | React + Solid + Vue |
| Accessibility | 5.0 | Ark UI state machines cover every edge case in WAI-ARIA patterns |
| Community | 2.0 | ~2.5k stars — smallest community in this evaluation; risky for long-term maintenance |
| Composability | 4.5 | Slot system + Panda CSS recipes = highly composable |
| AG-UI compat | 4.5 | No conflicts; Panda CSS might add build complexity |
| **Total** | **38.0** | |

---

### 5. Ark UI

**What it is:** Headless, state machine-powered component library by the Chakra UI team. 45+ components, framework-agnostic (React, Solid, Vue, Svelte). No default styling — BYO CSS. Park UI is built on top of Ark UI.

**Homepage:** https://ark-ui.com  
**GitHub stars:** ~3,000  
**npm downloads:** Moderate

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 3.0 | 45+ headless components; you provide all styling, no charts, no code blocks, no markdown |
| Streaming | 4.5 | State machine internals predict all UI states — zero race conditions or flicker under rapid updates |
| Theming | 3.0 | BYO CSS — maximum flexibility but requires full styling implementation from scratch |
| Bundle size | 5.0 | Very small (headless); zero CSS payload |
| React compat | 5.0 | React 18+; also Solid, Vue, Svelte |
| Accessibility | 5.0 | WAI-ARIA state machine implementations are among the best in the ecosystem |
| Community | 2.0 | Small but backed by Chakra UI team; unlikely to be abandoned |
| Composability | 5.0 | Pure primitives; combine in any way |
| AG-UI compat | 5.0 | No framework conflicts |
| **Total** | **37.5** | |

---

### 6. Chakra UI v3

**What it is:** v3 is a major rearchitect — now built on Ark UI under the hood with a recipe-based styling system. Composable, accessible, production-tested by many startups. React Server Components (RSC) support.

**Homepage:** https://chakra-ui.com  
**GitHub stars:** ~38,000  
**npm downloads:** ~4M/month

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 3.5 | ~50+ components; no charts, no code blocks, no command palette out of box |
| Streaming | 3.5 | CSS variables via recipe system; v3 removed emotion dependency — improved for rapid updates |
| Theming | 4.5 | Semantic color palettes, recipe/slot-based variants, CSS custom properties |
| Bundle size | 3.0 | Moderate; v3 lighter than v2 but still heavier than shadcn/ui |
| React compat | 5.0 | RSC support explicit in v3 docs |
| Accessibility | 4.5 | Built on Ark UI; WAI-ARIA baked in |
| Community | 4.0 | 38k stars; large, established community |
| Composability | 4.0 | Slot system + prop recipes enable novel layouts |
| AG-UI compat | 4.5 | No conflicts; works cleanly with CopilotKit |
| **Total** | **36.5** | |

---

### 7. MUI (Material UI)

**What it is:** The most downloaded React component library (~100+ components). Implements Google's Material Design. Comprehensive theming via MUI System. Uses emotion (CSS-in-JS) by default; supports Pigment CSS (zero-runtime) in v6+.

**Homepage:** https://mui.com  
**GitHub stars:** ~92,000  
**npm downloads:** ~25M/month

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 5.0 | Most comprehensive: 100+ core components + MUI X (DataGrid, Date/Time pickers, Charts) — all commercial features |
| Streaming | 2.5 | CSS-in-JS (emotion default) injects new `<style>` tags on render; at high-frequency AG-UI event rates, creates measurable jank; Pigment CSS (v6 opt-in) mitigates but migration is non-trivial |
| Theming | 4.0 | Very comprehensive; CSS variables support added in v5/v6; complex `createTheme()` setup |
| Bundle size | 2.0 | ~300-400kb for core + emotion; MUI X adds more; worst bundle impact in this evaluation |
| React compat | 5.0 | React 18+ |
| Accessibility | 4.5 | Strong WAI-ARIA; focus management; keyboard nav across all components |
| Community | 5.0 | 92k stars; largest community; millions of StackOverflow answers; LLMs know it extremely well |
| Composability | 3.5 | `sx` prop system; opinionated but workable; `styled()` API adds complexity |
| AG-UI compat | 3.5 | Works but CSS-in-JS can conflict with SSR streaming; emotion style injection not ideal for real-time UIs |
| **Total** | **35.0** | |

---

### 8. AgnosticUI

**What it is:** Framework-agnostic component library (React, Vue, Svelte, Solid, Lit, vanilla JS) with a local-install approach. Components live in your codebase, not node_modules. Marketed specifically as "AI-friendly" since AI can read your full component source.

**Homepage:** https://www.agnosticui.com  
**GitHub stars:** ~700  
**npm downloads:** Very small

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 3.5 | 70+ components; good general coverage; limited data viz, no charts, no code blocks |
| Streaming | 3.5 | Local code = controllable; CSS custom props; adequate |
| Theming | 3.5 | Dark mode + CSS custom properties; not as polished as Mantine or shadcn |
| Bundle size | 5.0 | Zero runtime (local code); you control everything |
| React compat | 4.0 | React + Vue + Svelte + Solid + Lit |
| Accessibility | 3.5 | Decent; not Radix-level |
| Community | 1.5 | Very small community; high abandonment risk |
| Composability | 4.0 | Local code = full control |
| AG-UI compat | 4.0 | No framework conflicts |
| **Total** | **32.5** | |

---

### 9. Ant Design

**What it is:** Enterprise-grade React component library, maintained primarily by Alibaba. ~60+ components optimized for data-heavy admin UIs. Large following in Chinese tech sector. v5 uses CSS-in-JS with design tokens.

**Homepage:** https://ant.design  
**GitHub stars:** ~92,000  
**npm downloads:** ~6M/month

#### Detailed Scores

| Criterion | Score | Notes |
|-----------|:-----:|-------|
| Coverage | 4.5 | 60+ comprehensive components including ProTable, ProForm, Charts (AntV); very strong for dashboards |
| Streaming | 3.0 | CSS-in-JS (v5) injects styles at runtime; less severe than MUI but still overhead at high frequency |
| Theming | 3.5 | Design token system (CSS variables in v5); algorithm-based theme generation; heavy setup for custom brand |
| Bundle size | 1.5 | Heaviest in this evaluation even with tree-shaking; AntV charts add significant weight |
| React compat | 4.0 | React 18+; some migration friction between v4→v5 |
| Accessibility | 3.5 | Adequate; less rigorous ARIA than Radix/Ark-based libraries |
| Community | 4.5 | 92k stars; massive but skewed toward Chinese market; English docs sometimes lag |
| Composability | 3.0 | Opinionated Material-Design-alternative aesthetic; harder to escape the "Ant Design look" |
| AG-UI compat | 3.0 | Bundle size and CSS-in-JS overhead are concerns for real-time streaming UIs |
| **Total** | **30.5** | |

---

## Master Comparison Table

| Framework | Coverage | Streaming | Theming | Bundle | React | A11y | Community | Composability | AG-UI | **Total** |
|-----------|:--------:|:---------:|:-------:|:------:|:-----:|:----:|:---------:|:-------------:|:-----:|:---------:|
| **shadcn/ui** | 4.5 | 4.0 | 5.0 | **5.0** | 5.0 | **5.0** | **5.0** | **5.0** | **5.0** | **43.5** |
| Mantine | 4.5 | **4.5** | **5.0** | 4.0 | 5.0 | 4.0 | 4.0 | 4.5 | **5.0** | **40.5** |
| Radix UI | 3.0 | 4.5 | **5.0** | 3.5 | 5.0 | **5.0** | 3.5 | **5.0** | **5.0** | **39.5** |
| Park UI | 3.5 | 4.5 | **5.0** | 4.0 | 5.0 | **5.0** | 2.0 | 4.5 | 4.5 | **38.0** |
| Ark UI | 3.0 | 4.5 | 3.0 | **5.0** | 5.0 | **5.0** | 2.0 | **5.0** | **5.0** | **37.5** |
| Chakra UI v3 | 3.5 | 3.5 | 4.5 | 3.0 | 5.0 | 4.5 | 4.0 | 4.0 | 4.5 | **36.5** |
| MUI | **5.0** | 2.5 | 4.0 | 2.0 | 5.0 | 4.5 | **5.0** | 3.5 | 3.5 | **35.0** |
| AgnosticUI | 3.5 | 3.5 | 3.5 | **5.0** | 4.0 | 3.5 | 1.5 | 4.0 | 4.0 | **32.5** |
| Ant Design | 4.5 | 3.0 | 3.5 | 1.5 | 4.0 | 3.5 | 4.5 | 3.0 | 3.0 | **30.5** |

**Scores: 1 (poor) → 5 (excellent)**

---

## Streaming Performance Deep Dive

This criterion deserves extra attention for NanoClaw because AG-UI StateDelta events can fire at 30–60Hz during active agent runs.

| Framework | CSS Approach | Streaming Risk | Notes |
|-----------|-------------|---------------|-------|
| shadcn/ui | Tailwind (static classes) + CSS vars | Low | No style recalc from agent events; DOM updates only |
| Mantine | Native CSS + CSS vars (no runtime) | Very Low | Best for high-frequency updates — zero JS-driven style work |
| Radix UI | CSS variables only | Very Low | Same advantage as Mantine |
| Park UI | Panda CSS (build-time extraction) | Very Low | No runtime CSS generation |
| Ark UI | BYO CSS (you control) | Very Low | State machine prevents UI flicker under rapid updates |
| Chakra UI v3 | Recipe-based (removed emotion in v3) | Low | Major improvement over v2 |
| MUI | emotion (CSS-in-JS runtime) | **High** | Injects `<style>` on render — noticeable jank at 30Hz |
| Ant Design | CSS-in-JS (v5) | Medium | Less severe than MUI but still overhead |
| AgnosticUI | CSS custom props (local) | Low | Controllable |

**Key insight:** For NanoClaw's streaming workload, eliminating CSS-in-JS is a prerequisite. MUI and Ant Design fail this test. shadcn/ui, Mantine, and the Ark UI family all pass.

---

## Coverage Gap Analysis

Components not natively covered by any framework that NanoClaw will need:

| Need | Recommended Addon | Compatible Frameworks |
|------|------------------|-----------------------|
| Markdown rendering | `react-markdown` + `remark-gfm` | All frameworks |
| Code syntax highlighting | `shiki` (via `@shikijs/react`) | All frameworks |
| Terminal/ANSI output | `ansi-to-react` or `xterm.js` | All frameworks |
| Diff viewer | `react-diff-viewer-continued` | All frameworks |
| JSON viewer | `react-json-view` | All frameworks |
| Virtual lists (for long agent output) | `@tanstack/react-virtual` | All frameworks |

shadcn/ui's `CodeHighlight` gap is smaller than it appears — adding `shiki` is 5 lines of code and 1 CLI command. Mantine's `@mantine/code-highlight` includes this out-of-the-box with Shiki/highlight.js adapters.

---

## Recommendation

### Primary: shadcn/ui

**Justification:**
1. **Best community** (111k stars) — this directly translates to better LLM assistance when building NanoClaw's UI components. Claude and other AI assistants write higher-quality shadcn/ui code than any other library.
2. **Zero bundle overhead** — copy-paste model means NanoClaw's UI ships only the components it uses. No tree-shaking guesswork.
3. **Full code ownership** — the UI channel's frontend assets can be modified without fighting library internals or waiting for upstream PRs.
4. **Streaming-safe** — Tailwind CSS classes don't cause style recalculation under AG-UI StateDelta events.
5. **Best accessibility** — Radix UI primitives provide WAI-ARIA compliance that would otherwise take months to build.
6. **Complete enough** — 80 components covers 95%+ of NanoClaw's needs; charts (Recharts), data tables (TanStack), and command palette are first-class addons.

**What shadcn/ui doesn't cover natively:**
- Markdown rendering → `react-markdown` + `remark-gfm` (2 addons, trivial)
- Code highlighting → `shiki` via `@shikijs/react` (1 addon, trivial)

### Secondary: Mantine

**Use Mantine if:** You want a single `npm install @mantine/core` with everything built in — including code highlighting, charts, rich text editor, and Spotlight (command palette). Lower copy-paste friction at the cost of slightly larger bundle and less "you own the code" ownership.

**Mantine is specifically stronger in:**
- `@mantine/code-highlight` — professional Shiki/highlight.js integration out of box
- `@mantine/tiptap` — WYSIWYG rich text (useful for the meeting prep workflow)
- Native CSS (no build tool requirement for theming)

### Not Recommended

- **MUI**: CSS-in-JS creates real-time streaming jank; bundle too large for NanoClaw's embedded web server
- **Ant Design**: Same CSS-in-JS problem; Chinese-market aesthetic diverges from desired polished-modern look
- **AgnosticUI**: Too small a community; high abandonment risk
- **Radix UI Themes alone**: Too many gaps (no charts, command palette, code blocks)
- **Park UI / Ark UI alone**: Beautiful but very small community; not enough pre-built pieces for NanoClaw's broad use case set

---

## Addendum: CopilotKit Compatibility

CopilotKit (`@copilotkit/react-core`, `@copilotkit/react-ui`) is a pure React library that integrates via hooks and context providers. It has no styling opinions — it injects its own minimal CSS for its built-in components, but those styles are scoped and don't conflict with any of the frameworks evaluated.

**Compatibility verdict:** All frameworks in this evaluation are fully compatible with CopilotKit. shadcn/ui is particularly clean because you can replace CopilotKit's default chat UI components with shadcn equivalents, giving you full visual consistency.

```tsx
// Example: shadcn/ui + CopilotKit integration
import { CopilotKit } from "@copilotkit/react-core";
import { useCopilotChat } from "@copilotkit/react-core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

function NanoclawChat() {
  const { visibleMessages, appendMessage, isLoading } = useCopilotChat();
  
  return (
    <ScrollArea className="h-[600px]">
      {visibleMessages.map(msg => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
    </ScrollArea>
  );
}
```

CopilotKit provides the AG-UI event wiring; shadcn/ui provides all the visual components. They compose cleanly.

---

*End of component framework evaluation. Next: t-2 (realistic use case design) in the same document.*

---

## Use Cases: NanoClaw UI in Action

> Written by BOI worker, iteration 2 (t-2) | 2026-04-01  
> Framework assumption: **shadcn/ui** (recommended from t-1, score 43.5)

All component references below use shadcn/ui component names unless noted as an addon library.

---

### UC-1: Interactive Hex Session

**User scenario:** The user opens the NanoClaw web UI and starts chatting with the `main` group — their primary Claude-powered assistant. They ask it to summarize a local file, search the web, and then run a shell command. The agent streams its response with markdown, renders tool calls inline, and pauses to request approval before executing the destructive shell command.

**NanoClaw groups involved:** `main`

**AG-UI events fired:**
1. `RUN_STARTED` — session begins, runId assigned
2. `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` (×N chunks) → `TEXT_MESSAGE_END` — streaming assistant reply
3. `TOOL_CALL_START` (name: `read_file`) → `TOOL_CALL_ARGS` → `TOOL_CALL_END` — file read tool call appears inline
4. `TOOL_CALL_RESULT` — file content returned, rendered in collapsible panel
5. `TOOL_CALL_START` (name: `web_search`) → same pattern
6. `STATE_SNAPSHOT` — agent sets `pendingApproval: { tool: "bash", command: "rm -rf ..." }` in shared state
7. `TEXT_MESSAGE_CONTENT` — agent writes "I need to run a shell command. Please approve below."
8. `CUSTOM` (type: `approval_request`) — structured approval payload: tool name, full command, impact summary
9. (User clicks Approve) → `TEXT_MESSAGE_START` (user input event via POST /api/input) → agent continues
10. `RUN_FINISHED`

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Outer shell | `ResizablePanelGroup` + `ResizablePanel` | Split: sidebar left, chat right |
| Message list | `ScrollArea` | Virtualized message stream |
| Agent message | Custom `ChatMessage` (built on `Card`) | Message bubble with role indicator |
| Streaming text | `react-markdown` + `@shikijs/react` (addons) | Markdown + code block rendering |
| Tool call card | `Collapsible` + `Badge` + `Separator` | Expandable tool call with args/result |
| Approval modal | `AlertDialog` + `Badge` (severity) + `ScrollArea` (command preview) | Full-page confirmation overlay |
| Command diff | `react-diff-viewer-continued` (addon) | Before/after preview of destructive action |
| Input | `Textarea` + `Button` + `Tooltip` | Message composition area |
| Status bar | `Badge` + `Progress` | "Thinking…" / "Running tool…" states |

**User interactions:**
- Types message in `Textarea`, submits with Enter or button
- Clicks chevron on tool call card to expand/collapse args and results
- Views inline file content in collapsible `Card`
- Receives approval `AlertDialog` for destructive bash command — reviews full command, clicks "Approve" or "Reject"
- Uses keyboard shortcut (Cmd+K) to open `Command` palette and switch groups

---

### UC-2: Multi-Group Dashboard

**User scenario:** The user opens a top-level dashboard showing the real-time health of all 4 NanoClaw groups simultaneously. `ops` shows system alerts, `boi` shows active spec progress, `gws` surfaces today's first 3 calendar events and unread email count, and `main` shows recent conversation snippets. The user can click any group card to open a focused session.

**NanoClaw groups involved:** `main`, `ops`, `gws`, `boi`

**AG-UI events fired (4 parallel SSE streams):**
- `ops` stream: `STATE_SNAPSHOT` (health metrics) → `STATE_DELTA` (patches as alerts arrive)
- `boi` stream: `STATE_DELTA` (spec task completions, iteration count increments)
- `gws` stream: `STATE_SNAPSHOT` (calendar + email digest) → `STATE_DELTA` (new email badge)
- `main` stream: `TEXT_MESSAGE_CONTENT` snippets (last 2 messages per thread)
- Any group: `CUSTOM` (type: `alert`) → surfaces in `ops` panel and global notification bar

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Dashboard grid | CSS Grid layout (Tailwind `grid-cols-2`) | 2×2 group card grid |
| Each group card | `Card` + `CardHeader` + `CardContent` | Unified group status widget |
| Ops alerts | `Alert` (variant: destructive/warning) + `ScrollArea` | Scrollable alert list |
| BOI progress | `Progress` + `Badge` + custom task list (built on `Table`) | Spec iteration timeline |
| GWS calendar | `Separator` + list of `Badge` + `HoverCard` (event details) | Today's events |
| GWS email | `Badge` (unread count) + `Button` ("Open in GWS") | Quick email summary |
| Main snippet | `ScrollArea` + truncated `ChatMessage` cards | Recent conversation |
| Notification bar | `Toast` (via Sonner) | Cross-group alerts as toasts |
| Group nav | `NavigationMenu` + `Badge` (unread/alert count) | Top nav with group switcher |

**User interactions:**
- Sees live updates as `STATE_DELTA` patches arrive — badges animate, progress bars fill
- Hovers a calendar event `Badge` to see `HoverCard` with full event details
- Clicks an `ops` alert to open a focused `ops` session
- Dismisses toasts for non-critical group events
- Clicks "Add note" on `main` card to inject a message into the thread from the dashboard

---

### UC-3: BOI Spec Monitoring

**User scenario:** A BOI spec (`q-373`) is running. The user opens the spec monitor view to watch tasks complete in real time. They see a vertical timeline of tasks, colored by status (PENDING / IN_PROGRESS / DONE / FAILED). Worker logs stream live below each active task. The user decides to skip t-5 and add a new task at the end.

**NanoClaw groups involved:** `boi`

**AG-UI events fired:**
1. `STATE_SNAPSHOT` — full spec state (all tasks, statuses, iteration count) on connect
2. `STATE_DELTA` — JSON Patch ops as tasks transition: `{ op: "replace", path: "/tasks/2/status", value: "DONE" }`
3. `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` (×N) → `TEXT_MESSAGE_END` — live worker stdout streamed as a text message per task
4. `CUSTOM` (type: `iteration_complete`) — fires when a worker exits, showing elapsed time
5. `CUSTOM` (type: `spec_complete`) — fires when all tasks are DONE

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Spec header | `Card` + `Badge` (status) + `Progress` | Spec title, queue ID, overall progress |
| Task timeline | `Accordion` (each task = one item) | Expandable task list with status icons |
| Task status icon | `Badge` (variant mapped to status color) | PENDING=gray, IN_PROGRESS=blue, DONE=green, FAILED=red |
| Worker log | `ScrollArea` + `react-markdown` + `@shikijs/react` | Streaming worker output inside expanded accordion item |
| Iteration counter | `Badge` + `Separator` | "Iteration 3 of 30" |
| Task actions | `DropdownMenu` (Skip / Add after / Move to next) | Per-task context menu |
| Add task dialog | `Dialog` + `Textarea` + `Input` + `Button` | Form to inject new PENDING task |
| Timing panel | `HoverCard` on iteration badge | Per-iteration elapsed time breakdown |

**User interactions:**
- Clicks an `Accordion` item to expand — sees live-streaming worker log
- Right-clicks (or clicks `DropdownMenu` trigger) on a PENDING task → selects "Skip" → confirmation `AlertDialog` → task marked SKIPPED
- Clicks "Add Task" → `Dialog` opens → fills in task title + spec text → submits → new `Accordion` item appears at bottom
- Watches `Progress` bar fill as tasks complete — each `STATE_DELTA` patch animates the bar

---

### UC-4: Meeting Prep Workflow

**User scenario:** The user asks the `gws` group "What's on my calendar today?" and then asks the `main` group "Generate a prep doc for my 2pm meeting with the board." The GWS group fetches real calendar data; the main group generates a structured prep doc. The user edits the doc inline; the agent refines it based on their edits.

**NanoClaw groups involved:** `gws`, `main`

**AG-UI events fired:**
1. `gws`: `TOOL_CALL_START` (name: `gcal_list_events`) → `TOOL_CALL_ARGS` → `TOOL_CALL_END` → `TOOL_CALL_RESULT`
2. `gws`: `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` (calendar summary) → `TEXT_MESSAGE_END`
3. `main`: `RUN_STARTED`
4. `main`: `TOOL_CALL_START` (name: `read_file`) → fetches meeting attendee context
5. `main`: `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` (×N, streaming document) → `TEXT_MESSAGE_END`
6. `STATE_SNAPSHOT` — sets `prepDoc: { title, sections: [...] }` in shared state
7. (User edits inline) → `STATE_DELTA` — user's edit patches the `prepDoc` state
8. `main`: `CUSTOM` (type: `agent_observation`) — agent detects edit and comments on the change
9. `main`: `TEXT_MESSAGE_START` → streams refined version → `TEXT_MESSAGE_END`

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Split layout | `ResizablePanelGroup` | Left: chat history; Right: live document |
| Calendar result | `Card` + list of event `Badge` items | GWS calendar response |
| Document editor | `@mantine/tiptap` (addon) or `Textarea` (simple) | Inline editable prep doc |
| Agent annotation | `HoverCard` on edited text | Agent's observation about the user's edit |
| Section navigation | `NavigationMenu` (sticky sidebar, anchored) | Jump to doc sections |
| Refinement chat | `ChatMessage` card + `ScrollArea` | Agent's commentary on edits |
| Export button | `DropdownMenu` (Copy as MD / Export to Drive) | Doc export options |

**User interactions:**
- Asks `gws` for calendar, sees event cards populate
- Types "Write me a prep doc for the 2pm board meeting" in `main` chat
- Watches prep doc stream into the right panel, rendered as structured markdown
- Clicks a section header to edit inline
- Agent detects the edit (via `STATE_DELTA`) and suggests a refinement in the chat panel
- User accepts by clicking "Apply suggestion" `Button`

---

### UC-5: Tool Approval Flow

**User scenario:** The `main` agent wants to send an email on the user's behalf. It pauses and surfaces a full-context approval form. The user can approve, reject, or edit the email before it's sent. A similar flow fires when the agent wants to post to Twitter or dispatch a BOI spec.

**NanoClaw groups involved:** `main`, `gws`

**AG-UI events fired:**
1. `main`: `TEXT_MESSAGE_CONTENT` — agent writes "I'm ready to send the following email. Please review:"
2. `STATE_SNAPSHOT` — sets `pendingApproval: { type: "email", to, subject, body, impact: "external communication" }`
3. `CUSTOM` (type: `approval_request`) — typed payload: `{ tool, displayTitle, previewHtml, severity: "high", canEdit: true }`
4. (User edits body) → `STATE_DELTA` — patches `pendingApproval.body`
5. (User clicks Approve) → POST /api/input — agent receives approval token and calls `gmail_create_draft` or `gmail_send`
6. `TOOL_CALL_START` (name: `gmail_send`) → `TOOL_CALL_END` → `TOOL_CALL_RESULT`
7. `RUN_FINISHED`

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Approval overlay | `Sheet` (slide-in panel from right) | Non-blocking approval review panel |
| Email preview | `Card` + rendered `react-markdown` HTML | "What will be sent" view |
| Editable draft | `Textarea` + `Label` (To/Subject/Body fields) | User can modify before approving |
| Diff preview | `react-diff-viewer-continued` | Show what user changed vs original |
| Impact badge | `Badge` (variant: destructive for external actions) | "External communication — irreversible" |
| Action buttons | `Button` (Approve, primary) + `Button` (Reject, destructive) + `Button` (Edit & Approve, outline) | Three approval paths |
| Twitter variant | Same `Sheet` + tweet character counter | 280-char limit shown with `Progress` |
| BOI spec variant | `Card` listing spec tasks + `Badge` count | Preview of what spec will be dispatched |
| History | `Accordion` (past approvals, collapsed) | Audit trail of approved/rejected tools |

**User interactions:**
- `Sheet` slides in, blocking interaction only within the sheet — chat remains visible
- Reads email draft in preview card
- Clicks "Edit" → `Textarea` fields become editable → types changes → `react-diff-viewer` shows diff
- Clicks "Approve" → `Sheet` closes, agent continues with send
- Or clicks "Reject" with optional `Textarea` reason → agent receives rejection and reacts

---

### UC-6: Landings Dashboard

**User scenario:** The user opens their daily "landings" tracker — a structured checklist of L1–L4 tiered objectives. The `boi` agent maintains this state and emits `STATE_DELTA` events as tasks are completed. The user can manually override a status, add sub-items, and see a changelog of today's updates.

**NanoClaw groups involved:** `boi`, `main`

**AG-UI events fired:**
1. `STATE_SNAPSHOT` — full landings state: `{ date, tiers: { L1: [...], L2: [...], L3: [...], L4: [...] }, changelog: [...] }`
2. `STATE_DELTA` — JSON Patch as items complete: `{ op: "replace", path: "/tiers/L1/0/status", value: "done" }`
3. `STATE_DELTA` — agent appends to changelog: `{ op: "add", path: "/changelog/-", value: { time, item, by: "boi" } }`
4. `CUSTOM` (type: `landing_alert`) — fires when an L1 item blocks on dependencies
5. (User overrides a status) → POST /api/input → `STATE_DELTA` patch from user reflected back

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Tier sections | `Accordion` (L1–L4 as items) with `Badge` count | Collapsible tier groups |
| Landing item | `Checkbox` + `Label` + `Badge` (priority/category) | Single actionable item |
| Sub-items | Indented `Checkbox` list under parent | Nested task breakdown |
| Status override | `DropdownMenu` (Done / Blocked / Deferred / Skip) | Manual status change |
| Changelog | `ScrollArea` + timeline list (custom, built on `Separator` + `Badge`) | Audit trail of today's changes |
| Alert banner | `Alert` (variant: warning) | L1 blocker callout |
| Progress summary | `Progress` + text "X of Y L1s done" | Day-level completion metric |
| Date header | `Card` header + `Badge` (today's date) | Day label + summary stats |

**User interactions:**
- Checks/unchecks `Checkbox` — optimistic update fires immediately, then syncs to state
- Opens `DropdownMenu` on an item to mark it Blocked or Deferred with a reason
- Expands `Accordion` for a tier to see sub-items
- Reads changelog entries in `ScrollArea` — each entry shows who made the change (agent vs user)
- Clicks "Add item" `Button` → inline `Input` appears at bottom of tier

---

### UC-7: Memory / Context Explorer

**User scenario:** The user wants to browse NanoClaw's memory system — per-group `MEMORY.md` files, shared context, and file-based memory entries. The `main` agent can surface relevant memories inline during conversation. The user can search, pin, and annotate memories.

**NanoClaw groups involved:** `main`

**AG-UI events fired:**
1. `STATE_SNAPSHOT` — memory index: `{ groups: { main: [...entries], boi: [...] }, shared: [...] }`
2. `TOOL_CALL_START` (name: `read_memory`) → `TOOL_CALL_RESULT` (entry content)
3. `CUSTOM` (type: `memory_surface`) — agent signals "I found a relevant memory" during conversation → UI highlights it in the explorer
4. `STATE_DELTA` — new memory entry added: `{ op: "add", path: "/groups/main/-", value: { name, description, type, body } }`

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Explorer layout | `ResizablePanelGroup` (3 panels: groups, entries, viewer) | Three-column layout |
| Group selector | `Tabs` (main / ops / gws / boi / shared) | Per-group memory filter |
| Entry list | `ScrollArea` + list of `Card` (compact) + `Badge` (type tag) | Memory entries |
| Search | `Command` (cmdk) | Full-text search across all memory entries |
| Entry viewer | `ScrollArea` + `react-markdown` (addon) | Full memory entry content |
| Relevance highlight | `Badge` (pulsing, via Tailwind `animate-pulse`) | "Surfaced by agent" indicator |
| Actions | `DropdownMenu` (Pin / Annotate / Delete) | Per-entry management |
| Add memory | `Dialog` + `Input` + `Textarea` + `Select` (type) | Manual memory creation form |

**User interactions:**
- Uses `Command` palette (Cmd+K) to search memory by keyword
- Clicks an entry in the list to view its full content in the right panel
- Agent surfaces a memory during conversation → relevant card pulses in the explorer
- User clicks "Pin" to mark a memory as always-loaded
- Clicks "Annotate" → `Dialog` opens with `Textarea` for adding notes to the memory

---

### UC-8: Evolution Engine UI

**User scenario:** The user reviews NanoClaw's self-improvement system. The `boi` agent (acting as the evolution engine) has accumulated observations and is proposing changes to skills, prompts, and behavior. The user reviews proposals, approves or rejects them, and sees metrics trend over time.

**NanoClaw groups involved:** `boi`

**AG-UI events fired:**
1. `STATE_SNAPSHOT` — `{ observations: [...], proposals: [...], changelog: [...], metrics: { before, after } }`
2. `STATE_DELTA` — new observation added: `{ op: "add", path: "/observations/-", value: { timestamp, source, text, severity } }`
3. `CUSTOM` (type: `proposal_ready`) — agent has drafted an improvement proposal
4. `TEXT_MESSAGE_START` → `TEXT_MESSAGE_CONTENT` — agent streams rationale for a proposal
5. (User approves) → POST /api/input → `STATE_DELTA`: `{ op: "replace", path: "/proposals/0/status", value: "approved" }`

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Observations feed | `ScrollArea` + `Card` per observation + `Badge` (severity) | Live observation stream |
| Proposals list | `Card` per proposal with `Badge` (pending/approved/rejected) | Improvement proposals |
| Diff viewer | `react-diff-viewer-continued` (addon) | Shows before/after for skill/prompt changes |
| Agent rationale | `Collapsible` + `react-markdown` | Expandable reasoning from agent |
| Metrics chart | Recharts `LineChart` (via shadcn/ui Charts) | Quality metric trends (before/after proposals) |
| Approval buttons | `Button` (Approve) + `Button` (Reject) + `Button` (Request changes) | Three-way proposal response |
| Changelog | `Accordion` (grouped by date) | Historical record of applied changes |
| Filter bar | `Select` (filter by severity/type) + `Input` (search) | Proposal/observation filtering |

**User interactions:**
- Reviews `Card` for a pending proposal — reads the diff, agent's rationale, and metric impact
- Expands `Collapsible` to read full agent reasoning
- Clicks "Approve" → proposal status updates via `STATE_DELTA` → appears in changelog
- Clicks "Request changes" → `Textarea` dialog → user types feedback → agent revises
- Views `LineChart` to see quality metric trend before and after applied proposals

---

### UC-9: Decision Log

**User scenario:** During conversations, the `main` agent automatically creates structured decision records when the user makes a significant choice (architecture, strategy, vendor selection). The user can browse, search, and filter past decisions. Each record shows the context, options considered, rationale, and outcome.

**NanoClaw groups involved:** `main`

**AG-UI events fired:**
1. `CUSTOM` (type: `decision_created`) — agent fires when a decision record is auto-generated mid-conversation
2. `STATE_DELTA` — new decision appended: `{ op: "add", path: "/decisions/-", value: { id, title, date, project, impact, options, chosen, rationale } }`
3. `TOOL_CALL_START` (name: `write_decision_record`) → `TOOL_CALL_RESULT`
4. `TEXT_MESSAGE_CONTENT` — agent announces: "I've logged this decision. You can review it in the Decision Log."
5. (User opens log and filters) → `STATE_DELTA` (no agent event — client-side filter)

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Log header | `Card` + search `Input` + `Select` (project filter) + `Select` (date range) | Search + filter bar |
| Decision list | `Table` (via TanStack Table + shadcn DataTable pattern) | Sortable, filterable decision list |
| Decision detail | `Sheet` (slide-in) + `Card` sections | Full record view |
| Options table | `Table` (options vs criteria) | Comparison of alternatives considered |
| Impact badge | `Badge` (variant mapped to impact: critical/high/medium/low) | Severity indicator |
| Rationale | `react-markdown` (addon) | Formatted rationale with context |
| New decision | `Dialog` + form (`Input`, `Textarea`, `Select`, `Button`) | Manual decision record creation |
| Notification | `Toast` (via Sonner) | "Decision auto-logged: Framework selection" |

**User interactions:**
- Receives `Toast` notification when agent auto-logs a decision
- Clicks notification → slides open `Sheet` with full decision record
- Uses `Table` column headers to sort by date, project, or impact
- Applies `Select` filter by project to narrow decision list
- Clicks "Create manually" → `Dialog` opens with structured form

---

### UC-10: File Browser with Agent Context

**User scenario:** The user browses the `~/mrap-hex` directory tree from the UI. They can click any file to view its contents with syntax highlighting. The `main` agent annotates recently read or modified files with context ("I read this file in the last conversation" / "This file changed 2 hours ago"). The agent can also open files on the user's behalf during a conversation.

**NanoClaw groups involved:** `main`

**AG-UI events fired:**
1. `STATE_SNAPSHOT` — directory tree structure (shallow, expanded on demand)
2. `TOOL_CALL_START` (name: `list_directory`) → `TOOL_CALL_RESULT` — directory expansion
3. `TOOL_CALL_START` (name: `read_file`) → `TOOL_CALL_RESULT` (file content)
4. `STATE_DELTA` — agent annotates a file: `{ op: "add", path: "/annotations/src~types.ts", value: { text, timestamp, agentGroup } }`
5. `CUSTOM` (type: `file_opened_by_agent`) — UI highlights the file in the tree when agent accesses it during conversation

**UI components rendered:**

| Area | shadcn/ui Component | Purpose |
|------|---------------------|---------|
| Layout | `ResizablePanelGroup` (tree left, viewer right) | Split file browser |
| Directory tree | Custom `Collapsible` tree (built on `Button` + `Separator`) | Expandable directory hierarchy |
| File node | `Button` (ghost variant) + `Badge` (annotation indicator) | Clickable file entry |
| File viewer | `ScrollArea` + `@shikijs/react` (addon) | Syntax-highlighted file content |
| Agent annotation | `HoverCard` (trigger on annotation `Badge`) | Shows agent's note on hover |
| Activity indicator | `Badge` (pulsing, Tailwind `animate-pulse`) + `Tooltip` | "Agent accessed this file 5 min ago" |
| Search | `Command` (cmdk) with file search | Fuzzy file search across tree |
| Breadcrumb | shadcn/ui `Breadcrumb` | Current path navigation |
| Recent files | `Popover` + list of `Button` (ghost) | Quick access to recently opened files |

**User interactions:**
- Clicks directory in tree → `Collapsible` opens, child entries rendered
- Clicks a file → content loads in right panel with syntax highlighting
- Hovers an annotation `Badge` → `HoverCard` shows agent's note
- Opens `Command` palette → types filename → jumps directly to file
- Watches highlighted file in tree pulse when agent reads it during active conversation
- Clicks "Open in chat" `Button` to inject the file path into the active chat input

---

## Use Case Summary

| UC | Title | Primary Group | Key AG-UI Events | Primary shadcn/ui Components |
|----|-------|:-------------:|-------------------|------------------------------|
| 1 | Interactive Hex Session | main | TEXT_MESSAGE_*, TOOL_CALL_*, CUSTOM (approval) | ScrollArea, Collapsible, AlertDialog, Textarea |
| 2 | Multi-Group Dashboard | all | STATE_SNAPSHOT, STATE_DELTA, CUSTOM (alert) | Card, Progress, Badge, Toast, NavigationMenu |
| 3 | BOI Spec Monitoring | boi | STATE_DELTA, TEXT_MESSAGE_*, CUSTOM (iteration) | Accordion, Badge, Progress, DropdownMenu, Dialog |
| 4 | Meeting Prep Workflow | gws, main | TOOL_CALL_*, TEXT_MESSAGE_*, STATE_DELTA | ResizablePanelGroup, HoverCard, @mantine/tiptap |
| 5 | Tool Approval Flow | main, gws | STATE_SNAPSHOT, CUSTOM (approval), TOOL_CALL_* | Sheet, Textarea, react-diff-viewer, Button |
| 6 | Landings Dashboard | boi, main | STATE_SNAPSHOT, STATE_DELTA, CUSTOM (alert) | Accordion, Checkbox, Progress, DropdownMenu |
| 7 | Memory / Context Explorer | main | STATE_SNAPSHOT, STATE_DELTA, CUSTOM (surface) | Command, ResizablePanelGroup, Tabs, Badge |
| 8 | Evolution Engine UI | boi | STATE_SNAPSHOT, STATE_DELTA, CUSTOM (proposal) | Card, react-diff-viewer, LineChart, Collapsible |
| 9 | Decision Log | main | CUSTOM (decision), STATE_DELTA, TEXT_MESSAGE_* | Table (TanStack), Sheet, Dialog, Toast |
| 10 | File Browser + Agent Context | main | STATE_DELTA, TOOL_CALL_*, CUSTOM (file_opened) | Collapsible tree, @shikijs/react, HoverCard, Command |

*All 10 use cases confirmed: component specifications provided for each. Total unique shadcn/ui components used: 28+.*

