# ULTRASPEC — Transaction Ledger Auditability v1

**Status:** APPROVED / FROZEN
**Owner approval:** 2026-08-20 — “ลุยแก้งานได้เลยครับ เสร็จแล้ว Commit Push Prod ได้เลยครับผม”
**Size / risk:** L / high (frontend + Worker API + additive D1 migration + production deployment)

## 1. Goal

Make the transaction ledger useful as an operational audit trail. Every visible transaction must clearly distinguish the person who submitted the information from the authenticated system user who recorded it, and expose enough source, evidence, status, and history context to investigate a row without changing financial totals.

## 2. In scope

- Show `submittedBy` as “ผู้ส่งข้อมูล” and `createdByName` as “ผู้บันทึก” on desktop, mobile, detail view, and exports.
- Add an additive `source_channel` field for new transactions and a conservative backfill for legacy rows.
- Expose source channel, reconciliation/draft/pending status, slip count, created/updated timestamps, print facts, and transaction audit history.
- Add ledger filters for creator, wallet, category, source channel, status, and evidence, while keeping existing date/type/scope/search behavior.
- Search transaction name/note plus submitter, recorder, category, subcategory, and wallet names.
- Log future reconcile, slip-upload, and slip-delete actions in the existing audit log.
- Preserve the dashboard-aligned totals and all existing role checks.

## 3. Out of scope

- Changing dashboard or transaction total formulas, wallet balance math, transaction authorization, or notification behavior.
- Editing shared LINE Pages Functions, tokens, secrets, Wrangler configuration, or authentication.
- Claiming whether legacy LINE records came from LIFF versus Bot when that distinction was never stored.
- Saved filter presets, approval workflow redesign, bulk actions, or accounting-period locks.
- Destructive data cleanup or a destructive down migration.

## 4. Change manifest

| Path | Change | Contract |
|---|---|---|
| `migrations/0008_transaction_ledger_details.sql` | new | Add/backfill `transactions.source_channel` and indexes only. |
| `worker.js` | edit | Add compatible fields/filters/history and audit events; preserve existing routes and calculations. |
| `src/api.js` | edit | Add transaction-history client method only. |
| `src/pages/Transactions.jsx` | edit | Ledger filters, actors/status cells, detail drawer, and source-aware import/export. |
| `src/csvUtils.js` | edit | Add audit columns without removing existing export columns. |
| `src/pages/BulkUpload.jsx` | edit | Mark new web bulk-slip transactions as `bulk_slip`. |
| `src/transactionLedger.js` | new | Pure source/status/actor/query helpers. |
| `src/transactionLedger.test.mjs` | new | Contract tests for ledger presentation/query helpers. |
| This file | new | Frozen implementation and rollback contract. |

All other files are forbidden unless this manifest is amended before editing. In particular, `functions/**`, secrets, deployment configuration, unrelated untracked files, and financial aggregation modules are forbidden.

## 5. Current-state evidence

- API already returns `submittedBy`, `createdByUserId`, and `createdByName`, but the page primarily renders `submittedBy` and omits the authenticated recorder.
- Search only covers transaction name and note; UI exposes only type and scope filters.
- Slip records and the workspace audit log exist, but the ledger row has no slip count and no transaction-scoped history endpoint.
- Reconcile and slip mutations do not currently add transaction audit events.
- Existing `source` only distinguishes `manual` and `auto`; historical LIFF/Bot provenance cannot be reconstructed reliably.

## 6. Data and API contract

### Source channel

Allowed values for new writes:

- `web`
- `line`
- `csv_import`
- `bulk_slip`
- `pending_bill`
- `recurring`
- `hros`
- `internal_transfer`
- `legacy_manual`

Resolution order for existing records is deterministic and conservative: transfer → internal transfer; auto → HROS; recurring → recurring; non-empty `submitted_by` → LINE; otherwise legacy manual. No legacy record is labelled LIFF or Bot specifically.

`POST /transactions` accepts optional `sourceChannel`; invalid values return 400. When omitted, `source=auto` resolves to HROS, the existing authenticated LINE service user or a non-empty `submittedBy` resolves to LINE, otherwise it resolves to web. Existing callers remain valid.

### List filters

`GET /transactions` remains backward compatible and additionally accepts:

- `createdByUserId`
- `sourceChannel`
- `status`: `posted`, `reconciled`, `unreconciled`, `draft`, `pending_edit`
- `hasSlip`: `true` or `false`

Each returned transaction additionally contains `sourceChannel` and integer `slipCount`. The list response also contains a workspace-scoped `creators` option list with user ID and nullable name so every ledger role can use the creator filter without broadening the admin-only users API. Existing response fields remain unchanged.

### History

`GET /transactions/:id/history` verifies workspace access, then returns the existing audit records for that transaction ordered newest first with actor name, action, parsed details, and timestamp. It does not broaden role permissions.

## 7. UI behavior

- Desktop includes a compact “ผู้เกี่ยวข้อง” cell with separate submitter and recorder labels, plus a compact evidence/status cell.
- Mobile shows the same facts below the primary row rather than hiding them.
- A single right-side detail drawer presents transaction facts, actors, source, timestamps, evidence, print state, and history.
- Empty values display `—`; `createdByName` falls back to “ไม่พบชื่อผู้ใช้” without substituting `submittedBy`.
- Filters apply consistently to list, summary, pagination, and export. Clearing filters restores the current date range.
- Clicking row/detail affordance does not trigger edit/delete/reconcile actions.
- Existing financial values and signs remain unchanged.

## 8. Error and edge behavior

- Missing or deleted creator: retain the creator ID where available and show a neutral unresolved label.
- No submitter: show “—”; never copy recorder name into submitter.
- History unavailable: drawer still shows transaction facts and a retryable error state.
- No slips: `slipCount = 0`; evidence filter must distinguish zero from one or more.
- Old API or pre-migration field missing: frontend helper derives a conservative source from existing fields.
- Search wildcards remain parameter-bound; no dynamic SQL values are interpolated.

## 9. Security and integration invariants

- Workspace predicate remains mandatory for list, count, detail-history, and slip/audit access.
- Existing admin/staff/viewer write restrictions remain unchanged.
- No token, secret, auth handler, Pages Function, or shared LINE path is changed.
- Source channel is metadata only and must never affect amounts, balances, or authorization.
- Audit details contain identifiers and mutation facts only; no file contents or secrets.

## 10. Implementation sequence

1. Capture git/production checkpoints and baseline tests.
2. Add pure frontend helpers and tests.
3. Add the additive migration and Worker API contract.
4. Add export fields and source-aware web import/bulk-slip writes.
5. Implement filters, actor/status presentation, and one detail drawer.
6. Run targeted tests, full build, lint delta, API syntax checks, and a context-isolated review.
7. Apply migration, deploy Worker, deploy Pages, smoke-test authenticated and shared LINE paths, then commit/push the exact manifest.

## 11. Verification matrix

| Layer | Required evidence |
|---|---|
| Pure behavior | Node tests cover dual identities, fallbacks, source resolution, status labels, and query construction. |
| Worker | Syntax/build check; list/count filters use identical predicates; workspace isolation reviewed. |
| Frontend | Production build succeeds; changed-file lint has no new errors; desktop/mobile states inspected. |
| Regression | Existing unit tests pass; dashboard total modules unchanged; LINE webhook file hash unchanged. |
| Production | Migration applied once; Worker and Pages deployment IDs captured; `/health` and authenticated ledger smoke checks pass; LINE endpoint remains reachable without exposing secrets. |

## 12. Acceptance criteria

- A system-keyed row displays the authenticated recorder even when `submittedBy` is null.
- A LINE-submitted row displays both submitter and recorder as separate labelled values.
- Creator/source/status/evidence filters return matching list, count, summary, and export results.
- Detail drawer shows slip count and transaction-scoped history without exposing another workspace.
- New web, CSV, bulk slip, HROS, recurring, transfer, and pending-bill transactions receive a deterministic source channel where their current code path is in this Worker/UI scope.
- Dashboard and ledger totals are unchanged for the same existing dataset.
- Shared LINE Function, secrets, and authentication remain byte-for-byte untouched.

## 13. Rollback

- Code: deploy the captured pre-change Worker version and prior Pages production deployment, then revert the implementation commit with a new git revert commit if needed. Never reset the shared branch.
- Data: the migration is additive. On rollback, leave the nullable `source_channel` column and indexes in place; the old application ignores them. Do not drop columns or rewrite transactions.
- Trigger: rollback if authenticated list/history fails, totals change, wallet balances drift, or the LINE webhook health/smoke check regresses.

## 14. Freeze rule

This document is frozen before production edits. Any scope, path, API, authorization, financial calculation, or shared integration change not listed above requires an explicit manifest amendment and a new approval checkpoint.

### Review clarification A — 2026-08-20

The approved creator-filter requirement applies to every role that can already view the workspace ledger. The response therefore includes only the recorder ID/name pairs already visible on transaction rows; it does not expose user email, profile, role, or permissions. The existing LINE service-user resolution is explicitly classified as `line`, including an unregistered submitter whose `submittedBy` is empty. This clarification closes independent-review findings without expanding authorization or the file manifest.
