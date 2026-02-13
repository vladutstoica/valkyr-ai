---
paths:
  - "src/main/db/**/*.ts"
  - "drizzle/**/*"
---

# Database Rules

## CRITICAL: Migration Safety

**NEVER manually edit:**
- `drizzle/meta/*.json` — Metadata files
- `drizzle/*.sql` — Numbered migration files

**Always use Drizzle Kit:**
```bash
# Modify schema in src/main/db/schema.ts, then:
pnpm exec drizzle-kit generate

# Browse database:
pnpm exec drizzle-kit studio
```

## Schema Location
`src/main/db/schema.ts` — Single source of truth for database schema

## Database Locations
| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/emdash/emdash.db` |
| Linux | `~/.config/emdash/emdash.db` |
| Windows | `%APPDATA%\emdash\emdash.db` |

Override with `EMDASH_DB_FILE` environment variable.

## Risk Assessment
- Schema mismatches can corrupt user data
- Always test migrations locally before committing
- Back up database before running destructive migrations
