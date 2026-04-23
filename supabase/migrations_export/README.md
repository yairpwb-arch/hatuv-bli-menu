# Database Migration Export

Complete export of the Lovable Cloud (Supabase) database for self-hosting.

## Run order

```
001_schema.sql                   -- extensions, enums, tables, indexes
003_functions_and_triggers.sql   -- functions FIRST so RLS can reference is_admin()
002_rls_policies.sql             -- enables RLS + creates all policies
004_storage.sql                  -- storage buckets + their object policies
```

> Run `003` before `002` so the `public.is_admin()` function exists when
> the policies are created. All files are idempotent and safe to re-run.

## Edge functions

Already located under `supabase/functions/`:
- `analyze-meal/index.ts`

Deploy with:
```
supabase functions deploy analyze-meal
```

## Secrets to set in your new project

- `LOVABLE_API_KEY` (or replace with your AI provider key inside the function)
- Supabase auto-provides: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

## Data migration

Schema only — to copy data, use `pg_dump --data-only` from the source DB
and `psql` into the target after running these migrations.
