---
name: Task
about: A unit of work an agent or human can pick up
labels: enhancement
---

## Context

Why this exists — the problem, what prompted it, the intended outcome. Cite the code that
proves the gap (`src/services/foo.ts:42`) rather than describing it.

## Scope

What changes, file by file. Name the existing helpers and patterns to reuse.

## Out of scope

What is deliberately skipped, and the trigger for revisiting it.

## Tests

Which suite, and the assertion that fails if the change breaks.
API/behavior → `test/integration/*.test.ts` · UI flow → `e2e/*.spec.ts` ·
parser/fetcher → `test/unit/` with stubbed fetch. New interactive controls need an
interaction-level assertion (`aria-pressed`, focus retention), not just end state.

## Verify

`npm run typecheck && npm test` (plus `npm run test:e2e` if the web UI changed), then how to
see it working in the running app.

## Done when

Checklist a reviewer can tick.
