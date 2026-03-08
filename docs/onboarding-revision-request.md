# Onboarding Revision Request

## Background

The current `/onboarding` command performs deep codebase exploration via Serena MCP
(recursive `list_dir`, `get_symbols_overview`, `find_symbol` with body reads).
This is expensive and unnecessary given the intended workflow.

## Intended Workflow

```
User → Claude (intent / planning)
         ↓
       Codex MCP (codebase investigation + implementation + commit)
         ↓ git log / git diff
       Claude (final review)
         ↓
       User (confirm / approve PR)
```

Claude does **not** need to explore the codebase in detail.
Codex handles all code-level investigation and implementation.
Claude's role is planning, delegation, and post-commit review.

## Requested Change: Lighten `/onboarding`

### Remove these steps
- Serena `activate_project`
- `list_dir` (recursive)
- `get_symbols_overview`
- `find_symbol` with body

### Keep these steps
1. Read `MEMORY.md` if it exists (skip if not)
2. `git status` + `git log --oneline -10`
3. Identify repo role — read only the `name` field from `wrangler.toml` or `package.json` (single read, no deep parse)
4. Write/update `MEMORY.md` on first run only

### Revised Onboarding Goals
1. Read CLAUDE.md (already in context via system-reminder)
2. Verify working tree status and show recent commits
3. Identify repo role from config name only
4. Populate MEMORY.md if absent

### Constraints (unchanged)
- No authentication checks
- No tool installation
- Don't start development work
- Don't use npm
