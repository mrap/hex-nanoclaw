---
name: memory-search
description: Search hex's memory using FTS5 and Hindsight semantic search
---

# Memory Search

Search hex's memory files for past context, decisions, people, and project history.

## Usage

```bash
python3 /workspace/group/.claude/skills/memory/scripts/memory_search.py "query terms"
python3 /workspace/group/.claude/skills/memory/scripts/memory_search.py --semantic "concept query"
python3 /workspace/group/.claude/skills/memory/scripts/memory_search.py --temporal "what happened last week"
python3 /workspace/group/.claude/skills/memory/scripts/memory_search.py --file people "name"
```

## Hindsight Access

For semantic and temporal queries, the script calls Hindsight. Inside a container, Hindsight is at `host.docker.internal:8888` (not `localhost`).

Set `HINDSIGHT_URL=http://host.docker.internal:8888` in the container environment.

Falls back to FTS5 keyword search silently if Hindsight is unreachable.
