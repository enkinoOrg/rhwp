# MD to HWPX 저장소 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RHWP에 들어간 Phase 1 템플릿 컴파일러를 독립 `md-to-hwpx` 저장소로 옮기고, 같은 대표 결과를 검증한 뒤 RHWP 본체에서 변환기 코드를 제거한다.

**Architecture:** `/Users/mhj/enkinokorea/2026/md-to-hwpx`는 별도 Cargo·Git 저장소이며 RHWP의 고정 Git 커밋을 라이브러리로만 사용한다. 이전은 독립 도구의 동등성 검증을 먼저 통과시킨 뒤 RHWP 원복을 수행하고, 원복 커밋으로 의존성을 다시 고정하는 두 단계로 진행한다.

**Tech Stack:** Rust 2021, Cargo, `rhwp` Git dependency, `serde`, `serde_json`, `snafu`, ZIP/HWPX fixture

## Global Constraints

- RHWP의 파서, 렌더러, 편집 엔진, Studio와 공개 API를 추가로 변경하지 않는다.
- 독립 실행 파일 이름은 `md-to-hwpx`다.
- RHWP 의존성은 브랜치나 로컬 경로가 아니라 전체 Git 커밋 SHA로 고정한다.
- Phase 1 이전 전후 대표 HWPX의 의미 동등성을 확인하기 전에는 RHWP 코드를 제거하지 않는다.
- 대표 비교 세트는 `input.md`, `template.hwpx`, `result.hwpx`, `comparison.md` 네 파일을 포함한다.
- 대표 세트 한 개만 Git에 보관하고 나머지 생성 결과는 `output/`에 두어 커밋하지 않는다.
- 각 저장소의 사람 대상 문서와 커밋 메시지는 한국어로 작성한다.
- RHWP shell 명령은 항상 `rtk`로 실행한다.

---

## File Map

### 독립 저장소 `/Users/mhj/enkinokorea/2026/md-to-hwpx`

- Create `Cargo.toml`: 독립 패키지와 고정 RHWP 의존성
- Create `src/lib.rs`: 프로파일·경계·패치 API 재노출
- Create `src/profile.rs`: Phase 1 스타일 역할 추론
- Create `src/boundary.rs`: Phase 1 본문 경계 후보 추천
- Create `src/patch.rs`: Phase 1 문단 패치
- Create `src/main.rs`: 독립 `md-to-hwpx spike` CLI
- Create `tests/phase1_equivalence.rs`: 실제 fixture 패치·직렬화·재로드 검증
- Create `samples/phase2/input.md`: 고정 Phase 1 초안의 사람이 읽는 원문
- Create `samples/phase2/template.hwpx`: 대표 템플릿 복사본
- Create `samples/phase2/result.hwpx`: 독립 도구의 대표 결과
- Create `samples/phase2/comparison.md`: 해시·경계·스타일·보존·페이지 비교
- Create `docs/logs/2026-07-18-phase1-repository-extraction.md`: 이전 검증 기록
- Create `.gitignore`: `target/`, `output/`, `.codegraph/`

### RHWP 저장소 `/Users/mhj/enkinokorea/2026/rhwp`

- Delete `src/document_core/template_compiler/mod.rs`
- Delete `src/document_core/template_compiler/profile.rs`
- Delete `src/document_core/template_compiler/boundary.rs`
- Delete `src/document_core/template_compiler/patch.rs`
- Delete `tests/template_compiler_phase1.rs`
- Modify `src/document_core/mod.rs`: `template_compiler` 공개 제거
- Modify `src/main.rs`: `template-spike` 분기·도움말·함수 제거
- Create `docs/logs/2026-07-18-template-compiler-extraction.md`: RHWP 원복 검증 기록

### Task 1: 독립 저장소에서 Phase 1 도메인 코드 빌드

**Files:**
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/Cargo.toml`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/src/lib.rs`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/src/profile.rs`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/src/boundary.rs`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/src/patch.rs`
- Test: 각 모듈의 기존 단위 테스트

**Interfaces:**
- Consumes: `rhwp::model::document::Document`, 문단·control·style 공개 타입
- Produces: `analyze_style_profile`, `rank_body_boundaries`, `patch_template`, `DraftBlock`, `StyleProfile`, `BoundaryCandidate`

- [ ] **Step 1: 독립 저장소와 실패하는 공개 API 테스트 생성**

먼저 빈 독립 저장소를 초기화한다.

```bash
rtk proxy mkdir -p /Users/mhj/enkinokorea/2026/md-to-hwpx/src
rtk git -C /Users/mhj/enkinokorea/2026/md-to-hwpx init
```

`Cargo.toml`은 다음 의존성을 사용한다.

```toml
[package]
name = "md-to-hwpx"
version = "0.1.0"
edition = "2021"

[dependencies]
rhwp = { git = "ssh://git@github.com/enkinoOrg/rhwp.git", rev = "d2448724ab70614e2c2d0a8108646d82c18f0ac3" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
snafu = "0.9"
```

`src/lib.rs`의 최초 실패 상태는 다음 공개 모듈 선언만 둔다.

```rust
pub mod boundary;
pub mod patch;
pub mod profile;
```

- [ ] **Step 2: 테스트가 구현 부재로 실패하는지 확인**

Run: `rtk cargo test`

Expected: FAIL — 세 모듈 파일 또는 공개 타입이 존재하지 않는다.

- [ ] **Step 3: Phase 1 구현과 의도 테스트를 독립 모듈로 이동**

RHWP의 세 소스 파일 내용을 독립 저장소로 복사하되 import만 다음 형태로 변경한다. 로직, 점수, 오류 정책과 테스트 assertion은 바꾸지 않는다.

```rust
use rhwp::model::control::Control;
use rhwp::model::document::Document;
use rhwp::model::paragraph::{CharShapeRef, Paragraph};
```

내부 모듈 참조는 독립 crate 경로를 사용한다.

```rust
use crate::boundary::BoundaryCandidate;
use crate::profile::{StyleProfile, TemplateRole};
```

- [ ] **Step 4: 독립 단위 테스트 실행**

Run: `rtk cargo test --lib`

Expected: PASS — 기존 프로파일·경계·패치 테스트 11개가 ignored 없이 통과한다.

- [ ] **Step 5: 독립 저장소 첫 커밋**

```bash
rtk git add Cargo.toml Cargo.lock src
rtk git commit -m "HWPX 템플릿 컴파일러를 독립 프로젝트로 이전"
```

### Task 2: 독립 CLI와 실제 HWPX 동등성 검증

**Files:**
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/src/main.rs`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/tests/phase1_equivalence.rs`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/samples/phase2/template.hwpx`

**Interfaces:**
- Consumes: `md-to-hwpx spike <template.hwpx> --boundary <section>:<paragraph> --output <result.hwpx>`
- Produces: 분석 JSON, 재로드 가능한 HWPX, non-zero 오류 종료

- [ ] **Step 1: 독립 CLI 실패 통합 테스트 작성**

```rust
#[test]
fn independent_cli_patches_and_reloads_fixture() {
    let output = temp_output("result.hwpx");
    let status = Command::new(env!("CARGO_BIN_EXE_md-to-hwpx"))
        .args(["spike", "samples/phase2/template.hwpx", "--boundary", "1:36", "--output"])
        .arg(&output)
        .status()
        .unwrap();
    assert!(status.success());
    assert!(rhwp::DocumentCore::from_bytes(&std::fs::read(output).unwrap()).is_ok());
}
```

- [ ] **Step 2: CLI 부재로 실패하는지 확인**

Run: `rtk cargo test --test phase1_equivalence independent_cli_patches_and_reloads_fixture`

Expected: FAIL — `md-to-hwpx` 바이너리 또는 `spike` 명령이 없다.

- [ ] **Step 3: 기존 `template-spike`를 독립 `spike` 명령으로 이동**

`src/main.rs`는 다음 분기와 사용법을 제공한다. 고정 초안과 입력 검증은 Phase 1 값을 그대로 유지한다.

```rust
fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    match args.get(1).map(String::as_str) {
        Some("spike") => run_spike(&args[2..]),
        _ => {
            eprintln!("사용법: md-to-hwpx spike <template.hwpx> --boundary S:P --output result.hwpx");
            std::process::exit(1);
        }
    }
}
```

- [ ] **Step 4: 실제 fixture 보존·재로드 테스트 이동 및 실행**

기존 `tests/template_compiler_phase1.rs`의 ZIP passthrough, `content.hpf` 의미, canonical 보존과 CLI 성공·실패 assertion을 독립 테스트로 이동한다. fixture 경로만 `samples/phase2/template.hwpx`로 바꾼다.

Run: `rtk cargo test --test phase1_equivalence`

Expected: PASS — 6개 테스트가 ignored 없이 통과한다.

- [ ] **Step 5: 독립 CLI 커밋**

```bash
rtk git add src/main.rs tests/phase1_equivalence.rs samples/phase2/template.hwpx
rtk git commit -m "독립 HWPX 템플릿 스파이크 CLI 추가"
```

### Task 3: 사람이 비교하는 대표 자료 생성

**Files:**
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/samples/phase2/input.md`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/samples/phase2/result.hwpx`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/samples/phase2/comparison.md`

**Interfaces:**
- Consumes: Phase 1 고정 다섯 블록, 대표 템플릿, 경계 `1:36`
- Produces: 사람이 열어 비교하는 네 파일의 완결된 세트

- [ ] **Step 1: 대표 Markdown 작성**

```markdown
# 공연 안전 운영 플랫폼 사업계획서 초안

## 1. 기획 개요

### 1-1. 기획 배경 및 필요성

공연 현장의 안전 관리 체계를 데이터 기반으로 고도화한다.

○ 공연 환경의 특수성을 반영한 통합 안전 관리

- 암전, 연무와 고밀도 군중 환경을 함께 분석한다.
```

- [ ] **Step 2: 독립 CLI로 대표 HWPX 생성**

Run: `rtk cargo run --release -- spike samples/phase2/template.hwpx --boundary 1:36 --output samples/phase2/result.hwpx`

Expected: exit 0, 결과 재로드 성공 메시지와 분석 JSON 출력.

- [ ] **Step 3: 비교 보고서 생성**

`comparison.md`에 `input.md`, `template.hwpx`, `result.hwpx`의 경로·SHA-256, RHWP 출처 커밋, 경계 `1:36`, 다섯 역할의 style ID, 원본·결과 페이지 수, 보존 검증, 재로드 결과를 실제 실행값으로 기록한다. `comparison.md` 자체는 자기참조 SHA-256·blob ID·커밋 ID를 내부에 기록하지 않고 Git 이력으로 버전을 식별한다고 명시한다. `input.md`는 Phase 1 고정 초안을 사람이 비교하기 위한 기준이며 이 마이그레이션 CLI가 아직 Markdown을 직접 읽지 않는다는 사실을 명시한다.

- [ ] **Step 4: 대표 자료 대응 테스트 추가**

```rust
#[test]
fn committed_comparison_set_is_complete_and_reloadable() {
    for path in ["input.md", "template.hwpx", "result.hwpx", "comparison.md"] {
        assert!(Path::new("samples/phase2").join(path).is_file());
    }
    let result = std::fs::read("samples/phase2/result.hwpx").unwrap();
    assert!(rhwp::DocumentCore::from_bytes(&result).is_ok());
}
```

Run: `rtk cargo test --test phase1_equivalence committed_comparison_set_is_complete_and_reloadable`

Expected: PASS.

- [ ] **Step 5: 대표 비교 자료 커밋**

```bash
rtk git add samples/phase2 tests/phase1_equivalence.rs
rtk git commit -m "Phase 1 이전 전후 비교 자료 추가"
```

### Task 4: RHWP에서 변환기 코드 제거

**Files:**
- Delete: `src/document_core/template_compiler/`
- Delete: `tests/template_compiler_phase1.rs`
- Modify: `src/document_core/mod.rs`
- Modify: `src/main.rs`
- Create: `docs/logs/2026-07-18-template-compiler-extraction.md`

**Interfaces:**
- Consumes: Task 1~3에서 검증된 독립 도구와 대표 결과
- Produces: 변환기 기능이 없는 기존 RHWP CLI·라이브러리·Studio

- [ ] **Step 1: 제거 전 독립 동등성 게이트 실행**

Run: `rtk cargo test --manifest-path ../md-to-hwpx/Cargo.toml`

Expected: PASS — 단위 11개와 통합 7개가 ignored 없이 통과한다. 실패하면 이 Task를 진행하지 않는다.

- [ ] **Step 2: RHWP 변환기 전용 파일과 공개 선언 제거**

`src/document_core/mod.rs`에서 다음 한 줄만 제거한다.

```rust
pub mod template_compiler;
```

`src/main.rs`에서는 `template-spike` match arm, 도움말 세 줄, `template_spike`, `validate_hwpx_input`, `parse_template_boundary` 함수만 제거한다. 다른 진단 명령은 수정하지 않는다.

- [ ] **Step 3: 제거 범위 검사**

Run: `rtk grep -n 'template_compiler|template-spike|template_spike' src tests`

Expected: 0 matches.

- [ ] **Step 4: RHWP 회귀 검증**

Run: `rtk cargo test`

Expected: PASS — 기존 ignored 22개 외 신규 ignored가 없다.

Run: `rtk npm test`

Expected: PASS — SDK 8개와 연동 32개, skipped 0.

Run: `rtk npm run build`

Expected: exit 0.

- [ ] **Step 5: RHWP 원복 로그와 커밋**

로그에 독립 저장소 경로·커밋, 제거 파일, 검증 집계와 production build 결과를 기록한다.

```bash
rtk git add src/document_core/mod.rs src/main.rs docs/logs/2026-07-18-template-compiler-extraction.md
rtk git add -u src/document_core/template_compiler tests/template_compiler_phase1.rs
rtk git commit -m "HWPX 템플릿 컴파일러를 독립 저장소로 이전"
```

### Task 5: RHWP 원복 커밋 고정과 양쪽 최종 검증

**Files:**
- Modify: `/Users/mhj/enkinokorea/2026/md-to-hwpx/Cargo.toml`
- Modify: `/Users/mhj/enkinokorea/2026/md-to-hwpx/Cargo.lock`
- Create: `/Users/mhj/enkinokorea/2026/md-to-hwpx/docs/logs/2026-07-18-phase1-repository-extraction.md`

**Interfaces:**
- Consumes: Task 4의 RHWP 원복 HEAD
- Produces: 변환기 코드가 없는 RHWP 커밋에 고정된 재현 가능한 독립 도구

- [ ] **Step 1: RHWP 원복 전체 SHA 확인**

Run: `rtk git -C /Users/mhj/enkinokorea/2026/rhwp rev-parse HEAD`

Expected: 40자리 SHA이며 Task 4 커밋을 가리킨다.

- [ ] **Step 2: 독립 Cargo 의존성을 확인한 SHA로 교체**

`Cargo.toml`의 `rhwp.rev`를 Step 1의 40자리 SHA로 정확히 교체하고 `rtk cargo update -p rhwp`로 lockfile을 갱신한다. 브랜치 또는 path 의존성을 추가하지 않는다.

- [ ] **Step 3: 독립 도구 최종 검증**

Run: `rtk cargo test && rtk cargo build --release && rtk git diff --check`

Expected: 전체 테스트 PASS, release build exit 0, diff check exit 0.

- [ ] **Step 4: RHWP 운영 URL 응답 확인**

Run: `rtk proxy curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://rhwp.enkinokorea.workers.dev`

Expected: `200 text/html`.

- [ ] **Step 5: 독립 저장소 로그와 커밋**

로그에 최초 RHWP SHA, 원복 RHWP SHA, 이전 전후 테스트 집계, 대표 입력·템플릿·결과 파일의 SHA-256, 비교 문서의 Git 식별 방식과 알려진 제한을 기록한다.

```bash
rtk git add Cargo.toml Cargo.lock docs/logs/2026-07-18-phase1-repository-extraction.md
rtk git commit -m "RHWP 원복 커밋으로 의존성 고정"
```

## Final Verification

- [ ] RHWP `src`와 `tests`에 `template_compiler`, `template-spike` 참조가 없다.
- [ ] RHWP 전체 Rust 테스트, `npm test`, production build가 통과한다.
- [ ] 운영 URL이 `200 text/html`로 응답한다.
- [ ] 독립 저장소가 path 의존성 없이 고정된 RHWP SHA로 빌드된다.
- [ ] 독립 단위·통합 테스트와 release build가 통과한다.
- [ ] `samples/phase2/`의 네 비교 파일을 사용자가 직접 열 수 있다.
- [ ] 대표 결과 HWPX가 재로드되고 Phase 1 보존 계약을 만족한다.
- [ ] 양쪽 저장소의 작업 로그에 실제 검증 결과와 생략 항목이 기록된다.

## 다음 계획

이 계획 완료 후 독립 `md-to-hwpx` 저장소에서 Phase 2B 계획을 작성한다. Phase 2B는 `input.md`를 실제로 읽는 결정적 Markdown 역할 추론, 명시적인 두 앵커와 `comparison.md` 자동 생성을 구현한다.
