# ADR 0001: Drizzle ORM with plain SQL migrations (instead of Prisma)

**Status:** accepted (Milestone 5). **Supersedes:** the Prisma assumption in BLUEPRINT §3 and §7.

## Context
The blueprint named Prisma. Two things changed the picture:
1. Prisma needs to download native engines (`binaries.prisma.sh`) to generate and migrate. That was not possible in the sandbox where this was built, so schema, migrations and tests could not be verified there. A tool that cannot run in a locked-down CI or build environment is a portability risk.
2. Milestone 6 needs `pgvector`. Prisma does not model vector columns natively (BLUEPRINT §3, row 3 already flagged this).

## Decision
Use **Drizzle ORM** on the **`pg`** driver. The schema is TypeScript (`apps/api/src/db/schema.ts`); `drizzle-kit generate` emits **plain SQL** migrations into `apps/api/drizzle/`, applied by a ~10 line runner (`src/db/migrate.ts`).

## Consequences
- Pure JavaScript: no engine binaries, works offline, identical in CI, Render and a laptop.
- Migrations are reviewable SQL files, and portable: they run on any Postgres (Neon, Render, RDS, local Docker).
- Vector columns are supported natively when M6 arrives.
- Less "magic" than Prisma (no generated client, relations are explicit). That is a feature for a course about backends, but it is more typing.
- If Prisma is preferred later, the data access is confined to `auth/*.ts` and `progress/repo.ts`; the HTTP layer does not know which ORM is used.
