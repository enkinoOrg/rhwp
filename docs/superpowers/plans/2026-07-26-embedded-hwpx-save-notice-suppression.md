# Embedded HWPX Save Notice Suppression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the standalone HWP conversion-save notice when RHWP Studio is embedded while preserving standalone behavior.

**Architecture:** Add an iframe guard to the existing notification function. Exercise the production function declaration in a Node VM to verify both the toast and status-message side effects.

**Tech Stack:** TypeScript, Node.js test runner, TypeScript compiler API, Vite, Cloudflare Workers

## Global Constraints

- iframe 임베드에서는 변환 저장 토스트와 상태 표시줄 안내를 모두 생략한다.
- 단독 RHWP의 HWPX 안내는 유지한다.
- Lawgent SDK와 `exportHwpx()` 저장 경로는 변경하지 않는다.

---

### Task 1: HWPX save notice policy

**Files:**
- Create: `rhwp-studio/tests/hwpx-save-notice-policy.test.ts`
- Modify: `rhwp-studio/src/main.ts:793-810`

**Interfaces:**
- Consumes: `window.parent`, `wasm.getSourceFormat()`, `showToast()`, `sbMessage()`
- Produces: `notifyHwpxSaveModeIfNeeded(): void`

- [ ] Add a source-executing test that asserts embedded HWPX produces no toast or status mutation, standalone HWPX produces both, and HWP produces neither.
- [ ] Run `rtk test node --test tests/hwpx-save-notice-policy.test.ts` and confirm only the embedded HWPX assertion fails.
- [ ] Add `if (window.parent !== window) return;` before the source-format check.
- [ ] Run `rtk test node --test tests/hwpx-save-notice-policy.test.ts`, `rtk test npm test`, and `rtk npm run build`.
- [ ] Commit only the new test and `src/main.ts`.

### Task 2: Publish and verify

- [ ] Push `enkino/self-host` to origin.
- [ ] Run `rtk npm run deploy` from the repository root.
- [ ] Verify the new Worker deployment and HTTP 200 asset response.
- [ ] Refresh the RHWP service worker and open the Lawgent v2 draft.
- [ ] Confirm the conversion notice is absent, five-page draft loads, and save is enabled.
