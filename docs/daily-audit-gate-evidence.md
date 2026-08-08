# Daily Close Audit Gate — Evidence Revision 1

Created: 2026-08-08T09:13:32+07:00
Code manifest: `daily-audit-gate-code-manifest.json` / `a484666d337d31d561f743041ea87d5f153964126c6bc2fead8e46a57bdc4be0`
Environment: Windows PowerShell, Node.js, Vite 8.0.11, Wrangler 4.90.1, isolated local D1/R2 fixture
Production/external effects: none

## Critical verification

| Evidence | Expected | Observed | State |
|---|---|---|---|
| `node --test` | repository suite passes | 13 tests, 13 pass, 0 fail | PASS |
| `npm run build` | production frontend builds | build succeeds; existing large-chunk warning only | PASS |
| Changed-file ESLint | no new lint errors in clean changed-file scope | exit 0 | PASS |
| Full ESLint comparison | no delta from captured baseline | baseline 258 errors/5 warnings; after excluding generated `.wrangler` temp 258 errors/5 warnings | PASS |
| `node --check worker.js` | Worker parses | exit 0 | PASS |
| `git diff --check` | no whitespace errors | exit 0; line-ending notices only | PASS |
| Fresh migration fixture | additive migration applies | final fresh state applies successfully | PASS |

## Runtime Worker/D1 checks

| Check | Observed evidence | State |
|---|---|---|
| Role/privacy matrix | Admin full audit; Staff full audit denied; Viewer denied; Staff issue response contains own IDs/codes only | PASS |
| Notification roles | Audit item present for Admin and absent for Staff | PASS |
| Evidence path | image upload and authenticated download succeed in isolated R2 | PASS |
| Close flow | missing exception reason=422; exception close, reopen and green close succeed | PASS |
| Idempotency/concurrency | same request returns prior event; cross-operation reuse=409; stale expected version=409 | PASS |
| Reconciliation | Staff cannot reconcile another user's row; own reconciliation metadata/event succeed | PASS |
| Duplicate resolution | membership-stable issue resolves and no longer blocks | PASS |
| Stale history | post-close transaction change materializes `needs_review` plus immutable `stale` event | PASS |
| Backdated change | prior-date transaction invalidates later close | PASS |
| Transfer counterpart | deleting personal/inactive counterpart invalidates business closure, adds broken-transfer blocker and Admin notification | PASS |
| Exact money | per-row rounding yields `-0.02` for two `0.005` legacy amounts; UI/server use integer satang for variance | PASS |
| Volume | 1,001 rows aggregate to `1010.01` without pagination loss | PASS |
| Wallet types | bank=`115`, credit=`-20`, cash behavior preserved | PASS |
| Workspace isolation | test workspace cannot read second workspace; second workspace reads only its wallet | PASS |
| History completeness | 201 same-day events returned, not truncated | PASS |
| Notification range | effective-date span of 69 pending days counted, not limited to 30 | PASS |
| Immutability | direct update of audit event rejected by D1 guard | PASS |
| Delete trigger | delete increments the audited wallet's monotonic change version | PASS |

## Independent review

- Spec reviewer: context-isolated Codex subagent; final verdict `APPROVE — high confidence`; no remaining BLOCKER/MAJOR.
- Standards reviewer: context-isolated Codex subagent; no remaining BLOCKER/MAJOR.
- Accepted findings fixed and retested: global API base scope, per-row satang, Staff SQL ownership, persisted stale events, cross-scope transfer pairs, strict observed strings, state transitions, transfer-counterpart invalidation, exact UI variance, history truncation and notification lookback.
- Conditional production release gate remains: compare hand-maintained `worker.js` with current production before any deploy.

## Non-critical non-pass evidence

| ID | State | Reason | Owner acceptance |
|---|---|---|---|
| T-11 | UNVERIFIED | Local browser security policy blocked the final loaded-state responsive/accessibility pass. Admin login, route/menu structure and production build were observed earlier. | Explicitly accepted in chat on 2026-08-08 with “โอเคลุยให้เสร็จครับ” after risk disclosure. |
| T-12 | PARTIAL | Existing recurring notification branches are unchanged and build/lint pass; interactive popup regression was not rerun. | Same acceptance. |
| T-13 | PARTIAL | Upload/download and orphan-cleanup code path were checked; forced metadata-write failure was not injected. | Same acceptance. |

Gate 3 verdict: `SHIP WITH UNVERIFIED ITEMS`.

## Rollback evidence

- Restore source: `C:\Users\Admin\AppData\Local\Temp\fintrack-audit-checkpoint-c780e3e-20260808`
- Baseline commit: `c780e3ed407a61a4212565ad0a57913ac6c8c07d`
- Manifest/hash verification: PASS for all seven pre-existing edited files.
- Restore drill: PASS at `C:\Users\Admin\AppData\Local\Temp\fintrack-audit-restore-drill-c780e3e-20260808`.
- Remote rollback, migration and deployment were not authorized or performed.
