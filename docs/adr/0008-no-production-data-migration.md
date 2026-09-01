# 8. No Production Data Migration for the UserId Switch

Date: 2026-09-01

## Status

Accepted

## Context

Switching the primary identifier from email address to `UserId` (ADR 0005)
renames every account's storage directory and rewrites the `issuer` / `sender` /
`kid` fields inside stored JSON. Existing deployments would need their `root.path`
tree restructured.

## Decision

There is **no** automated production migration. A deployment either starts fresh
or is migrated by hand, out of band, before the update. The change does ship a
full migration of the checked-in test data (server `src/test/resources/data` to
UUID directories plus a `user-ids.json` fixture, and the imagey-web Pact
fixtures), because the test suites must pass.

## Consequences

- **Positive:** no fragile on-the-fly migration code that could corrupt a live
  data tree.
- **Negative:** any existing production user loses access to their data unless an
  administrator migrates it manually first. Given the project has no production
  deployment yet, this is acceptable.
