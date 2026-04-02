#!/usr/bin/env python3
"""hex_migrate.py — Migrate hex markdown data to NanoClaw-native SQLite.

Usage:
  python3 scripts/hex_migrate.py --init                    # Create DB + schema only
  python3 scripts/hex_migrate.py --phase 1                 # Run phase 1 import
  python3 scripts/hex_migrate.py --phase 1 --dry-run       # Preview without writing
  python3 scripts/hex_migrate.py --phase all               # Run all phases
  python3 scripts/hex_migrate.py --validate                # Check migration completeness
"""
import sqlite3
import pathlib
import re
import sys
import argparse
from datetime import datetime, timezone

HEX_ROOT = pathlib.Path.home() / "mrap-hex"
DB_PATH = pathlib.Path.home() / "github.com/mrap/hex-nanoclaw/store/nanoclaw-context.db"

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 30000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profile (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL DEFAULT 'main'
);
CREATE INDEX IF NOT EXISTS idx_user_profile_updated ON user_profile(updated_at);

CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  section    TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL DEFAULT 'ops'
);
CREATE INDEX IF NOT EXISTS idx_system_config_section ON system_config(section);

CREATE TABLE IF NOT EXISTS learnings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT NOT NULL,
  category     TEXT,
  session_id   TEXT,
  source_group TEXT NOT NULL DEFAULT 'main',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learnings_category ON learnings(category);
CREATE INDEX IF NOT EXISTS idx_learnings_created ON learnings(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS learnings_fts USING fts5(
  content, category, content='learnings', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS learnings_ai AFTER INSERT ON learnings BEGIN
  INSERT INTO learnings_fts(rowid, content, category) VALUES (new.id, new.content, new.category);
END;
CREATE TRIGGER IF NOT EXISTS learnings_ad AFTER DELETE ON learnings BEGIN
  INSERT INTO learnings_fts(learnings_fts, rowid, content, category) VALUES ('delete', old.id, old.content, old.category);
END;

CREATE TABLE IF NOT EXISTS decisions (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL DEFAULT 'personal',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'main'
);
CREATE INDEX IF NOT EXISTS idx_decisions_scope ON decisions(scope);
CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);

CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
  title, body, scope, content='decisions', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
  INSERT INTO decisions_fts(rowid, title, body, scope) VALUES (new.rowid, new.title, new.body, new.scope);
END;
CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
  INSERT INTO decisions_fts(decisions_fts, rowid, title, body, scope) VALUES ('delete', old.rowid, old.title, old.body, old.scope);
END;

CREATE TABLE IF NOT EXISTS watchlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item         TEXT NOT NULL,
  notes        TEXT,
  added_at     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT,
  source_group TEXT NOT NULL DEFAULT 'main'
);

CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  priority     INTEGER NOT NULL DEFAULT 50,
  area         TEXT NOT NULL DEFAULT 'general',
  action       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'main'
);
CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todos_area ON todos(area);

CREATE VIRTUAL TABLE IF NOT EXISTS todos_fts USING fts5(
  action, area, content='todos', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS todos_ai AFTER INSERT ON todos BEGIN
  INSERT INTO todos_fts(rowid, action, area) VALUES (new.id, new.action, new.area);
END;
CREATE TRIGGER IF NOT EXISTS todos_ad AFTER DELETE ON todos BEGIN
  INSERT INTO todos_fts(todos_fts, rowid, action, area) VALUES ('delete', old.id, old.action, old.area);
END;

CREATE TABLE IF NOT EXISTS project_contexts (
  project    TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL DEFAULT 'main'
);

CREATE VIRTUAL TABLE IF NOT EXISTS project_contexts_fts USING fts5(
  project, content, content='project_contexts', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS project_contexts_ai AFTER INSERT ON project_contexts BEGIN
  INSERT INTO project_contexts_fts(rowid, project, content) VALUES (new.rowid, new.project, new.content);
END;
CREATE TRIGGER IF NOT EXISTS project_contexts_ad AFTER DELETE ON project_contexts BEGIN
  INSERT INTO project_contexts_fts(project_contexts_fts, rowid, project, content) VALUES ('delete', old.rowid, old.project, old.content);
END;

CREATE TABLE IF NOT EXISTS project_decisions (
  id           TEXT PRIMARY KEY,
  project      TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'main'
);
CREATE INDEX IF NOT EXISTS idx_project_decisions_project ON project_decisions(project);

CREATE VIRTUAL TABLE IF NOT EXISTS project_decisions_fts USING fts5(
  title, body, project, content='project_decisions', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS project_decisions_ai AFTER INSERT ON project_decisions BEGIN
  INSERT INTO project_decisions_fts(rowid, title, body, project) VALUES (new.rowid, new.title, new.body, new.project);
END;
CREATE TRIGGER IF NOT EXISTS project_decisions_ad AFTER DELETE ON project_decisions BEGIN
  INSERT INTO project_decisions_fts(project_decisions_fts, rowid, title, body, project) VALUES ('delete', old.rowid, old.title, old.body, old.project);
END;

CREATE TABLE IF NOT EXISTS meetings (
  id           TEXT PRIMARY KEY,
  project      TEXT,
  meeting_date TEXT,
  agenda       TEXT,
  notes        TEXT,
  participants TEXT,
  source_group TEXT NOT NULL DEFAULT 'main'
);

CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
  agenda, notes, project, content='meetings', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS meetings_ai AFTER INSERT ON meetings BEGIN
  INSERT INTO meetings_fts(rowid, agenda, notes, project) VALUES (new.rowid, new.agenda, new.notes, new.project);
END;
CREATE TRIGGER IF NOT EXISTS meetings_ad AFTER DELETE ON meetings BEGIN
  INSERT INTO meetings_fts(meetings_fts, rowid, agenda, notes, project) VALUES ('delete', old.rowid, old.agenda, old.notes, old.project);
END;

CREATE TABLE IF NOT EXISTS people (
  handle       TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  bio          TEXT,
  context      TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'main'
);

CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
  display_name, context, content='people', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, display_name, context) VALUES (new.rowid, new.display_name, new.context);
END;
CREATE TRIGGER IF NOT EXISTS people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, display_name, context) VALUES ('delete', old.rowid, old.display_name, old.context);
END;

CREATE TABLE IF NOT EXISTS landings (
  id           TEXT PRIMARY KEY,
  landing_type TEXT NOT NULL CHECK(landing_type IN ('daily','weekly')),
  landing_date TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'main'
);
CREATE INDEX IF NOT EXISTS idx_landings_date ON landings(landing_date);
CREATE INDEX IF NOT EXISTS idx_landings_type ON landings(landing_type);

CREATE TABLE IF NOT EXISTS evolution_metrics (
  key          TEXT PRIMARY KEY,
  value        REAL NOT NULL,
  unit         TEXT,
  description  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'ops'
);

CREATE TABLE IF NOT EXISTS transcripts (
  id           TEXT PRIMARY KEY,
  session_date TEXT NOT NULL,
  content      TEXT NOT NULL,
  word_count   INTEGER,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transcripts_date ON transcripts(session_date);

CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
  content, content='transcripts', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS transcripts_ai AFTER INSERT ON transcripts BEGIN
  INSERT INTO transcripts_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS transcripts_ad AFTER DELETE ON transcripts BEGIN
  INSERT INTO transcripts_fts(transcripts_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TABLE IF NOT EXISTS captures (
  id           TEXT PRIMARY KEY,
  captured_at  TEXT NOT NULL DEFAULT (datetime('now')),
  source       TEXT,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'untriaged',
  processed_at TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
  content, source, content='captures', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS captures_ai AFTER INSERT ON captures BEGIN
  INSERT INTO captures_fts(rowid, content, source) VALUES (new.rowid, new.content, new.source);
END;
CREATE TRIGGER IF NOT EXISTS captures_ad AFTER DELETE ON captures BEGIN
  INSERT INTO captures_fts(captures_fts, rowid, content, source) VALUES ('delete', old.rowid, old.content, old.source);
END;

CREATE TABLE IF NOT EXISTS research_docs (
  id           TEXT PRIMARY KEY,
  spec_id      TEXT,
  title        TEXT,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  source_group TEXT NOT NULL DEFAULT 'boi'
);

CREATE VIRTUAL TABLE IF NOT EXISTS research_docs_fts USING fts5(
  title, content, content='research_docs', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS research_docs_ai AFTER INSERT ON research_docs BEGIN
  INSERT INTO research_docs_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS research_docs_ad AFTER DELETE ON research_docs BEGIN
  INSERT INTO research_docs_fts(research_docs_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;
"""


def get_db(dry_run=False):
    if dry_run:
        db = sqlite3.connect(":memory:")
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(str(DB_PATH))
    db.executescript(SCHEMA_SQL)
    return db


# ─── Phase 1: Decisions, People, Watchlist, Metrics ──────────────────────────

def migrate_decisions(db):
    imported = skipped = 0
    dec_dir = HEX_ROOT / "me/decisions"
    if not dec_dir.exists():
        print("  decisions: directory not found, skipping")
        return
    for path in sorted(dec_dir.glob("*.md")):
        slug = path.stem
        body = path.read_text(encoding="utf-8")
        m = re.search(r'^#\s+(.+)$', body, re.MULTILINE)
        title = m.group(1).strip() if m else slug.replace("-", " ").title()
        db.execute(
            "INSERT OR IGNORE INTO decisions(id, scope, title, body, source_group) VALUES (?,?,?,?,?)",
            (slug, "personal", title, body, "main")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
        else:
            skipped += 1
    db.commit()
    print(f"  decisions: {imported} imported, {skipped} skipped")


def migrate_project_decisions(db):
    imported = skipped = 0
    for path in sorted(HEX_ROOT.glob("projects/*/decisions/*.md")):
        project = path.parts[-3]
        slug = f"{project}:{path.stem}"
        body = path.read_text(encoding="utf-8")
        m = re.search(r'^#\s+(.+)$', body, re.MULTILINE)
        title = m.group(1).strip() if m else path.stem.replace("-", " ").title()
        db.execute(
            "INSERT OR IGNORE INTO project_decisions(id, project, title, body, source_group) VALUES (?,?,?,?,?)",
            (slug, project, title, body, "main")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
        else:
            skipped += 1
    db.commit()
    print(f"  project_decisions: {imported} imported, {skipped} skipped")


def migrate_people(db):
    imported = skipped = 0
    for path in sorted(HEX_ROOT.glob("people/*/profile.md")):
        handle = path.parts[-2]
        body = path.read_text(encoding="utf-8")
        m = re.search(r'^#\s+(.+)$', body, re.MULTILINE)
        display_name = m.group(1).strip() if m else handle
        db.execute(
            "INSERT OR IGNORE INTO people(handle, display_name, context, source_group) VALUES (?,?,?,?)",
            (handle, display_name, body, "main")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
        else:
            skipped += 1
    db.commit()
    print(f"  people: {imported} imported, {skipped} skipped")


def migrate_watchlist(db):
    wl_path = HEX_ROOT / "me/watchlist.md"
    if not wl_path.exists():
        print("  watchlist: file not found, skipping")
        return
    text = wl_path.read_text(encoding="utf-8")
    items = re.findall(r'^[-*]\s+(.+)$', text, re.MULTILINE)
    db.execute("DELETE FROM watchlist")
    imported = 0
    for item in items:
        db.execute("INSERT INTO watchlist(item, source_group) VALUES (?,?)", (item.strip(), "main"))
        imported += 1
    db.commit()
    print(f"  watchlist: {imported} items imported")


def migrate_evolution_metrics(db):
    path = HEX_ROOT / "evolution/metrics.md"
    if not path.exists():
        print("  evolution_metrics: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    rows = re.findall(r'^\|\s*([^|]+)\|\s*([0-9.]+)\s*\|\s*([^|]*)\|', text, re.MULTILINE)
    imported = 0
    for key, value, unit in rows:
        try:
            db.execute(
                "INSERT OR REPLACE INTO evolution_metrics(key, value, unit, source_group) VALUES (?,?,?,?)",
                (key.strip(), float(value), unit.strip() or None, "ops")
            )
            imported += 1
        except ValueError:
            pass
    db.commit()
    print(f"  evolution_metrics: {imported} rows imported")


# ─── Phase 2: Todos, Landings, Project Contexts, Meetings ───────────────────

def migrate_todos(db):
    path = HEX_ROOT / "todo.md"
    if not path.exists():
        print("  todos: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute("DELETE FROM todos")
    imported = 0
    current_area = "general"
    priority = 50
    for line in text.splitlines():
        m_area = re.match(r'^#{1,3}\s+(.+)$', line)
        if m_area:
            current_area = m_area.group(1).strip().lower()
            priority = 50
            continue
        m_checkbox = re.match(r'^[-*]\s+\[([x ])\]\s+(.+)$', line)
        if m_checkbox:
            checked = m_checkbox.group(1)
            action = m_checkbox.group(2).strip()
            status = "done" if checked == "x" else "open"
            if action:
                db.execute(
                    "INSERT INTO todos(priority, area, action, status, source_group) VALUES (?,?,?,?,?)",
                    (priority, current_area, action, status, "main")
                )
                imported += 1
                priority += 1
            continue
        m_bullet = re.match(r'^  [-*]\s+(.+)$', line)
        if m_bullet:
            # Sub-items (indented bullets)
            action = m_bullet.group(1).strip()
            if action:
                m_sub_check = re.match(r'\[([x ])\]\s+(.+)', action)
                if m_sub_check:
                    status = "done" if m_sub_check.group(1) == "x" else "open"
                    action = m_sub_check.group(2).strip()
                else:
                    status = "open"
                db.execute(
                    "INSERT INTO todos(priority, area, action, status, source_group) VALUES (?,?,?,?,?)",
                    (priority, current_area, action, status, "main")
                )
                imported += 1
                priority += 1
    db.commit()
    print(f"  todos: {imported} items imported")


def migrate_landings(db):
    imported = 0
    for path in sorted(HEX_ROOT.glob("landings/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md")):
        lid = path.stem
        content = path.read_text(encoding="utf-8")
        db.execute(
            "INSERT OR IGNORE INTO landings(id, landing_type, landing_date, content, source_group) VALUES (?,?,?,?,?)",
            (lid, "daily", lid, content, "main")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
    for path in sorted(HEX_ROOT.glob("landings/weekly/*.md")):
        lid = path.stem
        content = path.read_text(encoding="utf-8")
        db.execute(
            "INSERT OR IGNORE INTO landings(id, landing_type, landing_date, content, source_group) VALUES (?,?,?,?,?)",
            (lid, "weekly", lid, content, "main")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
    db.commit()
    print(f"  landings: {imported} imported")


def migrate_project_contexts(db):
    imported = 0
    for path in sorted(HEX_ROOT.glob("projects/*/context.md")):
        project = path.parts[-2]
        content = path.read_text(encoding="utf-8")
        db.execute(
            "INSERT OR REPLACE INTO project_contexts(project, content, updated_by) VALUES (?,?,?)",
            (project, content, "main")
        )
        imported += 1
    db.commit()
    print(f"  project_contexts: {imported} imported")


def migrate_meetings(db):
    imported = 0
    for path in sorted(HEX_ROOT.glob("projects/*/meetings/*.md")):
        project = path.parts[-3]
        mid = f"{project}:{path.stem}"
        content = path.read_text(encoding="utf-8")
        m = re.search(r'(\d{4}-\d{2}-\d{2})', path.stem)
        meeting_date = m.group(1) if m else None
        db.execute(
            "INSERT OR IGNORE INTO meetings(id, project, meeting_date, notes, source_group) VALUES (?,?,?,?,?)",
            (mid, project, meeting_date, content, "main")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
    db.commit()
    print(f"  meetings: {imported} imported")


# ─── Phase 3: Learnings, User Profile ────────────────────────────────────────

def migrate_learnings(db):
    path = HEX_ROOT / "me/learnings.md"
    if not path.exists():
        print("  learnings: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute("DELETE FROM learnings")
    imported = 0
    current_category = "general"
    for line in text.splitlines():
        m_cat = re.match(r'^##\s+(.+)$', line)
        if m_cat:
            current_category = m_cat.group(1).strip().lower()
            continue
        m_item = re.match(r'^[-*]\s+(.+)$', line)
        if m_item:
            content = m_item.group(1).strip()
            if content and not content.startswith("_"):
                db.execute(
                    "INSERT INTO learnings(content, category, source_group) VALUES (?,?,?)",
                    (content, current_category, "main")
                )
                imported += 1
    db.commit()
    print(f"  learnings: {imported} observations imported")


def migrate_user_profile(db):
    path = HEX_ROOT / "me/me.md"
    if not path.exists():
        print("  user_profile: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute(
        "INSERT OR REPLACE INTO user_profile(key, value, updated_by) VALUES (?,?,?)",
        ("full_profile", text, "main")
    )
    m = re.search(r'^#\s+(.+)$', text, re.MULTILINE)
    if m:
        db.execute(
            "INSERT OR REPLACE INTO user_profile(key, value, updated_by) VALUES (?,?,?)",
            ("name", m.group(1).strip(), "main")
        )
    db.commit()
    print(f"  user_profile: imported")


# ─── Phase 4: Transcripts, Captures, Research ────────────────────────────────

def migrate_transcripts(db):
    imported = 0
    for path in sorted(HEX_ROOT.glob("raw/transcripts/*.md")):
        tid = path.stem
        content = path.read_text(encoding="utf-8")
        word_count = len(content.split())
        m = re.search(r'(\d{4}-\d{2}-\d{2})', tid)
        session_date = m.group(1) if m else tid
        db.execute(
            "INSERT OR IGNORE INTO transcripts(id, session_date, content, word_count) VALUES (?,?,?,?)",
            (tid, session_date, content, word_count)
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
    db.commit()
    print(f"  transcripts: {imported} imported")


def migrate_captures(db):
    imported = 0
    for path in sorted(HEX_ROOT.glob("raw/captures/*.md")):
        cid = path.stem
        content = path.read_text(encoding="utf-8")
        captured_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        db.execute(
            "INSERT OR IGNORE INTO captures(id, captured_at, source, content) VALUES (?,?,?,?)",
            (cid, captured_at, "file", content)
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
    db.commit()
    print(f"  captures: {imported} imported")


def migrate_research(db):
    imported = 0
    for path in sorted(HEX_ROOT.glob("raw/research/*.md")):
        rid = path.stem
        content = path.read_text(encoding="utf-8")
        m = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = m.group(1).strip() if m else rid.replace("-", " ").title()
        m_spec = re.search(r'q-(\d+)', content)
        spec_id = f"q-{m_spec.group(1)}" if m_spec else None
        db.execute(
            "INSERT OR IGNORE INTO research_docs(id, spec_id, title, content, source_group) VALUES (?,?,?,?,?)",
            (rid, spec_id, title, content, "boi")
        )
        if db.execute("SELECT changes()").fetchone()[0]:
            imported += 1
    db.commit()
    print(f"  research_docs: {imported} imported")


# ─── Phase 5: System Config, Evolution Data ──────────────────────────────────

def migrate_system_config(db):
    path = HEX_ROOT / "CLAUDE.md"
    if not path.exists():
        print("  system_config: CLAUDE.md not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute(
        "INSERT OR REPLACE INTO system_config(key, value, section, updated_by) VALUES (?,?,?,?)",
        ("claude_md_full", text, "identity", "ops")
    )
    db.commit()
    print(f"  system_config: CLAUDE.md imported")


def migrate_observations(db):
    path = HEX_ROOT / "evolution/observations.md"
    if not path.exists():
        print("  observations: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute(
        "INSERT OR IGNORE INTO captures(id, source, content, status) VALUES (?,?,?,?)",
        ("evolution-observations", "evolution", text, "processed")
    )
    db.commit()
    print(f"  observations: imported")


def migrate_suggestions(db):
    path = HEX_ROOT / "evolution/suggestions.md"
    if not path.exists():
        print("  suggestions: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute(
        "INSERT OR IGNORE INTO captures(id, source, content, status) VALUES (?,?,?,?)",
        ("evolution-suggestions", "evolution", text, "processed")
    )
    db.commit()
    print(f"  suggestions: imported")


def migrate_changelog(db):
    path = HEX_ROOT / "evolution/changelog.md"
    if not path.exists():
        print("  changelog: file not found, skipping")
        return
    text = path.read_text(encoding="utf-8")
    db.execute(
        "INSERT OR IGNORE INTO captures(id, source, content, status) VALUES (?,?,?,?)",
        ("evolution-changelog", "evolution", text, "processed")
    )
    db.commit()
    print(f"  changelog: imported")


# ─── Validation ──────────────────────────────────────────────────────────────

def validate(db):
    checks = [
        ("user_profile", "SELECT count(*) FROM user_profile"),
        ("learnings", "SELECT count(*) FROM learnings"),
        ("decisions", "SELECT count(*) FROM decisions"),
        ("project_decisions", "SELECT count(*) FROM project_decisions"),
        ("watchlist", "SELECT count(*) FROM watchlist"),
        ("todos", "SELECT count(*) FROM todos"),
        ("project_contexts", "SELECT count(*) FROM project_contexts"),
        ("meetings", "SELECT count(*) FROM meetings"),
        ("people", "SELECT count(*) FROM people"),
        ("landings", "SELECT count(*) FROM landings"),
        ("evolution_metrics", "SELECT count(*) FROM evolution_metrics"),
        ("transcripts", "SELECT count(*) FROM transcripts"),
        ("captures", "SELECT count(*) FROM captures"),
        ("research_docs", "SELECT count(*) FROM research_docs"),
        ("system_config", "SELECT count(*) FROM system_config"),
    ]
    print("\n=== Migration Validation ===")
    total = 0
    for name, query in checks:
        try:
            count = db.execute(query).fetchone()[0]
            status = "OK" if count > 0 else "EMPTY"
            print(f"  {name:25s} {count:6d} rows  [{status}]")
            total += count
        except Exception as e:
            print(f"  {name:25s}  ERROR: {e}")
    print(f"\n  Total records: {total}")

    print("\n  FTS5 spot checks:")
    fts_checks = [
        ("decisions_fts", "SELECT count(*) FROM decisions_fts"),
        ("learnings_fts", "SELECT count(*) FROM learnings_fts"),
        ("todos_fts", "SELECT count(*) FROM todos_fts"),
        ("transcripts_fts", "SELECT count(*) FROM transcripts_fts"),
        ("captures_fts", "SELECT count(*) FROM captures_fts"),
        ("research_docs_fts", "SELECT count(*) FROM research_docs_fts"),
    ]
    for name, query in fts_checks:
        try:
            count = db.execute(query).fetchone()[0]
            print(f"    {name:25s} {count:6d} indexed")
        except Exception as e:
            print(f"    {name:25s}  ERROR: {e}")


# ─── Phase registry ─────────────────────────────────────────────────────────

PHASES = {
    "1": ("Decisions, People, Watchlist, Metrics", [
        migrate_decisions, migrate_project_decisions, migrate_people,
        migrate_watchlist, migrate_evolution_metrics,
    ]),
    "2": ("Todos, Landings, Project Contexts, Meetings", [
        migrate_todos, migrate_landings, migrate_project_contexts, migrate_meetings,
    ]),
    "3": ("Learnings, User Profile", [
        migrate_learnings, migrate_user_profile,
    ]),
    "4": ("Transcripts, Captures, Research Docs", [
        migrate_transcripts, migrate_captures, migrate_research,
    ]),
    "5": ("System Config, Evolution Data", [
        migrate_system_config, migrate_observations, migrate_suggestions, migrate_changelog,
    ]),
}


def main():
    global HEX_ROOT
    parser = argparse.ArgumentParser(description="Migrate hex data to NanoClaw-native SQLite")
    parser.add_argument("--init", action="store_true", help="Create DB and schema only")
    parser.add_argument("--phase", type=str, help="Phase to run: 1-5 or 'all'")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--validate", action="store_true", help="Check migration completeness")
    parser.add_argument("--hex-root", type=str, default=str(HEX_ROOT), help="Path to hex workspace")
    args = parser.parse_args()

    HEX_ROOT = pathlib.Path(args.hex_root)

    if args.init:
        db = get_db(args.dry_run)
        table_count = db.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        print(f"Schema initialized: {table_count} tables created")
        if not args.dry_run:
            print(f"Database: {DB_PATH}")
        db.close()
        return

    if args.phase:
        db = get_db(args.dry_run)
        phases_to_run = sorted(PHASES.keys()) if args.phase == "all" else [args.phase]
        for phase_num in phases_to_run:
            if phase_num not in PHASES:
                print(f"Unknown phase: {phase_num}. Available: {', '.join(sorted(PHASES.keys()))}")
                sys.exit(1)
            name, funcs = PHASES[phase_num]
            print(f"\n=== Phase {phase_num}: {name} ===")
            for func in funcs:
                func(db)
        db.close()
        if args.dry_run:
            print("\n(dry run — no data written)")
        return

    if args.validate:
        db = get_db(False)
        validate(db)
        db.close()
        return

    print("Use --init to create schema, --phase N to import data, --validate to check")


if __name__ == "__main__":
    main()
