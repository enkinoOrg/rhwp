# HWPX Template Compiler Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 HWPX 한 개에서 대표 문단 스타일과 본문 시작 후보를 추출하고, 사용자가 선택한 경계 뒤에 고정된 의미 블록을 삽입하여 재로드 가능한 HWPX를 만드는 기술 검증을 구현한다.

**Architecture:** `document_core::template_compiler`가 순수 Rust 도메인 계층으로 분석과 패치를 담당한다. AI와 Markdown 파서는 Phase 1에 포함하지 않으며, 기존 `DocumentCore`의 로드·`set_document`·페이지네이션·HWPX 직렬화를 재사용한다.

**Tech Stack:** Rust 2021, RHWP Document IR, `serde`/`serde_json`, Rust 내장 테스트

## Global Constraints

- 입력 템플릿은 HWPX만 허용한다.
- 경계 이전의 원본 문단·표·이미지와 문서 전역 리소스를 변경하지 않는다.
- 스타일 추론 결과와 경계 후보에는 점수와 판정 근거를 포함한다.
- 지원하지 못하는 구조는 조용히 삭제하지 않고 오류로 반환한다.
- Phase 1은 제목·본문·핵심항목·세부항목 텍스트만 삽입한다.
- 표, 이미지, Markdown 파싱, AI 작성과 페이지 축약은 후속 Phase로 남긴다.
- 모든 shell 명령은 프로젝트 규칙에 따라 `rtk`로 실행한다.

---

## File Map

- Create `src/document_core/template_compiler/mod.rs`: 공개 타입 재노출과 모듈 경계
- Create `src/document_core/template_compiler/profile.rs`: 역할, 프로파일과 스타일 추출
- Create `src/document_core/template_compiler/boundary.rs`: 본문 시작 후보 점수화
- Create `src/document_core/template_compiler/patch.rs`: 고정 의미 블록을 원본 IR에 삽입
- Modify `src/document_core/mod.rs`: `template_compiler` 공개 모듈 등록
- Modify `src/main.rs`: `template-spike` 네이티브 진단 명령 추가
- Create `tests/template_compiler_phase1.rs`: 실제 HWPX 로드·패치·직렬화·재로드 통합 테스트

### Task 1: StyleProfile 도메인과 결정적 스타일 추출

**Files:**
- Create: `src/document_core/template_compiler/mod.rs`
- Create: `src/document_core/template_compiler/profile.rs`
- Modify: `src/document_core/mod.rs`

**Interfaces:**
- Consumes: `crate::model::document::Document`, 문단의 `para_shape_id`, 첫 `CharShapeRef.char_shape_id`
- Produces: `analyze_style_profile(document: &Document) -> StyleProfile`

- [ ] **Step 1: 실패 테스트 작성**

`profile.rs`에 굵은 큰 글자 제목, 일반 본문, `○`, `-` 문단을 가진 합성 Document 테스트를 추가한다.

```rust
#[test]
fn extracts_four_phase1_roles_from_repeated_paragraphs() {
    let doc = fixture_document();
    let profile = analyze_style_profile(&doc);
    assert_eq!(profile.roles[&TemplateRole::SectionHeading].para_shape_id, 1);
    assert_eq!(profile.roles[&TemplateRole::Body].para_shape_id, 2);
    assert_eq!(profile.roles[&TemplateRole::KeyPoint].marker.as_deref(), Some("○"));
    assert_eq!(profile.roles[&TemplateRole::Detail].marker.as_deref(), Some("-"));
    assert!(profile.roles.values().all(|role| role.confidence > 0.0));
}
```

- [ ] **Step 2: 실패 확인**

Run: `rtk cargo test template_compiler::profile::tests::extracts_four_phase1_roles_from_repeated_paragraphs`

Expected: FAIL — `template_compiler` 또는 `analyze_style_profile`이 존재하지 않는다.

- [ ] **Step 3: 최소 타입과 분석기 구현**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TemplateRole { SectionHeading, SubsectionHeading, Body, KeyPoint, Detail }

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RoleStyle {
    pub para_shape_id: u16,
    pub char_shape_id: u32,
    pub marker: Option<String>,
    pub confidence: f32,
    pub evidence: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StyleProfile {
    pub roles: BTreeMap<TemplateRole, RoleStyle>,
}

pub fn analyze_style_profile(document: &Document) -> StyleProfile
```

본문은 빈도가 가장 높은 `(para_shape_id, char_shape_id)` 조합으로 선택한다. `○`와 `-`로 시작하는 문단은 각각 `KeyPoint`, `Detail`로 분류한다. 제목은 번호 패턴, 본문보다 큰 글자 크기, 굵기와 앞뒤 간격에 점수를 부여하고 상위 두 스타일을 단계별 제목으로 선택한다. 증거 문자열에는 사용한 규칙을 기록한다.

- [ ] **Step 4: 테스트와 전체 라이브러리 테스트 실행**

Run: `rtk cargo test template_compiler::profile`

Expected: PASS

Run: `rtk cargo test --lib`

Expected: PASS. 저장소 기준선의 기존 ignored 22건은 허용하되 Task 4 신규 ignored는 0건이어야 한다.

- [ ] **Step 5: 커밋**

```bash
rtk git add src/document_core/mod.rs src/document_core/template_compiler/mod.rs src/document_core/template_compiler/profile.rs
rtk git commit -m "HWPX 템플릿 스타일 프로파일 추출"
```

### Task 2: 본문 시작 후보 상위 3개 추천

**Files:**
- Create: `src/document_core/template_compiler/boundary.rs`
- Modify: `src/document_core/template_compiler/mod.rs`

**Interfaces:**
- Consumes: `StyleProfile`, `Document`
- Produces: `rank_body_boundaries(document: &Document, profile: &StyleProfile, limit: usize) -> Vec<BoundaryCandidate>`

- [ ] **Step 1: 실패 테스트 작성**

```rust
#[test]
fn ranks_first_major_heading_after_front_matter_first() {
    let doc = boundary_fixture();
    let profile = analyze_style_profile(&doc);
    let candidates = rank_body_boundaries(&doc, &profile, 3);
    assert_eq!(candidates[0].section_index, 0);
    assert_eq!(candidates[0].paragraph_index, 5);
    assert!(candidates[0].reasons.iter().any(|r| r.contains("쪽 나눔")));
    assert!(candidates.len() <= 3);
}
```

- [ ] **Step 2: 실패 확인**

Run: `rtk cargo test template_compiler::boundary::tests::ranks_first_major_heading_after_front_matter_first`

Expected: FAIL — `rank_body_boundaries`가 존재하지 않는다.

- [ ] **Step 3: 후보 타입과 점수화 구현**

```rust
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BoundaryCandidate {
    pub section_index: usize,
    pub paragraph_index: usize,
    pub score: i32,
    pub heading: String,
    pub before_preview: Vec<String>,
    pub after_preview: Vec<String>,
    pub reasons: Vec<String>,
}
```

제목 역할 일치 `+40`, 쪽 나눔 직후 `+25`, 앞쪽 빈 문단 `+10`, 문서 앞 5% 이내 `-20`, 표 컨트롤 포함 문단 `-30`으로 점수화한다. 점수 내림차순, `(section_index, paragraph_index)` 오름차순으로 안정 정렬하고 `limit.min(3)`개만 반환한다.

- [ ] **Step 4: 테스트 실행**

Run: `rtk cargo test template_compiler::boundary`

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
rtk git add src/document_core/template_compiler/boundary.rs src/document_core/template_compiler/mod.rs
rtk git commit -m "HWPX 본문 시작 후보 추천"
```

### Task 3: 고정 의미 블록을 원본 IR에 패치

**Files:**
- Create: `src/document_core/template_compiler/patch.rs`
- Modify: `src/document_core/template_compiler/mod.rs`

**Interfaces:**
- Consumes: `Document`, `StyleProfile`, 선택된 `BoundaryCandidate`, `&[DraftBlock]`
- Produces: `patch_template(document: &Document, boundary: &BoundaryCandidate, profile: &StyleProfile, blocks: &[DraftBlock]) -> Result<Document, TemplateCompileError>`

- [ ] **Step 1: 보존 의도를 검증하는 실패 테스트 작성**

```rust
#[test]
fn preserves_front_matter_and_replaces_only_selected_tail() {
    let original = patch_fixture();
    let preserved = original.sections[0].paragraphs[..3]
        .iter()
        .map(|p| (p.text.clone(), p.para_shape_id, p.char_shapes.iter().map(|r| (r.start_pos, r.char_shape_id)).collect::<Vec<_>>(), p.controls.len()))
        .collect::<Vec<_>>();
    let patched = patch_template(&original, &candidate(0, 3), &profile(), &draft()).unwrap();
    let actual = patched.sections[0].paragraphs[..3]
        .iter()
        .map(|p| (p.text.clone(), p.para_shape_id, p.char_shapes.iter().map(|r| (r.start_pos, r.char_shape_id)).collect::<Vec<_>>(), p.controls.len()))
        .collect::<Vec<_>>();
    assert_eq!(actual, preserved);
    assert_eq!(patched.sections[0].paragraphs[3].text, "1. 기획 개요");
    assert_eq!(patched.doc_info.char_shapes.len(), original.doc_info.char_shapes.len());
    assert!(patched.sections[0].raw_stream.is_none());
}
```

- [ ] **Step 2: 실패 확인**

Run: `rtk cargo test template_compiler::patch::tests::preserves_front_matter_and_replaces_only_selected_tail`

Expected: FAIL — `patch_template`이 존재하지 않는다.

- [ ] **Step 3: 최소 블록과 패처 구현**

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum DraftBlock {
    SectionHeading(String),
    SubsectionHeading(String),
    Body(String),
    KeyPoint(String),
    Detail(String),
}

#[derive(Debug, snafu::Snafu)]
pub enum TemplateCompileError {
    #[snafu(display("본문 경계가 문서 범위를 벗어났습니다: section={section}, paragraph={paragraph}"))]
    InvalidBoundary { section: usize, paragraph: usize },
    #[snafu(display("템플릿 역할이 없습니다: {role:?}"))]
    MissingRole { role: TemplateRole },
}
```

원본 `Document`를 clone하고 선택 구역의 경계 이후 문단과 이후 구역의 본문을 교체한다. 새 문단은 역할의 `para_shape_id`, `char_shape_id`, UTF-16 기반 `char_count`와 `char_offsets`를 사용하고 `line_segs`는 비워 `DocumentCore::set_document`의 재조판 경로가 계산하게 한다. 변경 구역의 `raw_stream`은 `None`으로 설정한다.

- [ ] **Step 4: 패치 테스트와 라이브러리 테스트 실행**

Run: `rtk cargo test template_compiler::patch`

Expected: PASS

Run: `rtk cargo test --lib`

Expected: PASS. 저장소 기준선의 기존 ignored 22건은 허용하되 Task 4 신규 ignored는 0건이어야 한다.

- [ ] **Step 5: 커밋**

```bash
rtk git add src/document_core/template_compiler/patch.rs src/document_core/template_compiler/mod.rs
rtk git commit -m "HWPX 템플릿 본문 패치"
```

### Task 4: 실제 HWPX 스파이크 CLI와 재로드 통합 검증

**Files:**
- Modify: `src/main.rs`
- Create: `tests/template_compiler_phase1.rs`
- Create: `docs/logs/2026-07-17-hwpx-template-compiler-phase1.md`

**Interfaces:**
- Consumes: `rhwp template-spike <template.hwpx> --boundary <section>:<paragraph> -o <output.hwpx>`
- Produces: stdout의 `StyleProfile`/경계 후보 JSON, 패치된 HWPX, 검증 로그

- [ ] **Step 1: 실제 fixture 통합 실패 테스트 작성**

```rust
#[test]
fn patches_serializes_and_reloads_real_hwpx() {
    let bytes = std::fs::read("samples/rowbreak-problem-pages.hwpx").unwrap();
    let mut core = rhwp::DocumentCore::from_bytes(&bytes).unwrap();
    let original_aux = zip_passthrough_aux_entries(&bytes);
    let original_content_hpf = content_hpf_semantics(&bytes);
    let profile = analyze_style_profile(core.document());
    let boundary = user_selected_boundary(1, 36);
    let patched = patch_template(core.document(), &boundary, &profile, &phase1_draft()).unwrap();
    core.set_document(patched);
    let output = core.export_hwpx_native().unwrap();
    let reloaded = rhwp::DocumentCore::from_bytes(&output).unwrap();
    assert_eq!(zip_passthrough_aux_entries(&output), original_aux);
    assert_eq!(content_hpf_semantics(&output), original_content_hpf);
    assert!(reloaded.document().sections.iter().any(|s| s.paragraphs.iter().any(|p| p.text.contains("기획 개요"))));
}
```

- [ ] **Step 2: 실패 확인**

Run: `rtk cargo test --test template_compiler_phase1`

Expected: FAIL — 공개 API 또는 fixture 초안 helper가 아직 연결되지 않았다.

- [ ] **Step 3: CLI 명령 구현**

`src/main.rs` 명령 분기에 `template-spike`를 추가한다. 경계를 생략하면 분석 JSON만 출력하고 파일을 쓰지 않는다. `--boundary S:P`가 있으면 Phase 1 고정 초안을 패치하고 `-o` 경로에 HWPX를 쓴 뒤 즉시 재로드한다. 재로드 실패 시 non-zero 종료 코드를 반환한다.

고정 초안은 다음 다섯 블록을 사용한다.

```rust
vec![
    DraftBlock::SectionHeading("1. 기획 개요".into()),
    DraftBlock::SubsectionHeading("1-1. 기획 배경 및 필요성".into()),
    DraftBlock::Body("공연 현장의 안전 관리 체계를 데이터 기반으로 고도화한다.".into()),
    DraftBlock::KeyPoint("공연 환경의 특수성을 반영한 통합 안전 관리".into()),
    DraftBlock::Detail("암전, 연무와 고밀도 군중 환경을 함께 분석한다.".into()),
]
```

- [ ] **Step 4: 통합 및 전체 검증 실행**

Run: `rtk cargo test --test template_compiler_phase1`

Expected: PASS

Run: `rtk cargo test`

Expected: PASS. 저장소 기준선의 기존 ignored 22건은 허용하되 Task 4 신규 ignored는 0건이어야 한다.

Run: `rtk cargo build --release`

Expected: exit 0

Run: `rtk proxy cargo run --quiet --bin rhwp -- template-spike samples/hwpx_sample2.hwpx`

Expected: JSON에 1개 이상의 역할과 최대 3개 경계 후보가 포함된다.

Run: `rtk proxy cargo run --quiet --bin rhwp -- template-spike samples/hwpx_sample2.hwpx --boundary 0:0 -o output/template-spike.hwpx`

Expected: `output/template-spike.hwpx` 생성 및 재로드 성공 메시지

- [ ] **Step 5: 작업 로그 작성**

`docs/logs/2026-07-17-hwpx-template-compiler-phase1.md`에 사용한 fixture, 선택 경계, 추출 역할, 보존 검증, 테스트·빌드 결과와 알려진 한계를 기록한다. 배포는 사용자 요청이 없으므로 실행하지 않았다고 명시한다.

- [ ] **Step 6: 커밋**

```bash
rtk git add src/main.rs tests/template_compiler_phase1.rs docs/logs/2026-07-17-hwpx-template-compiler-phase1.md
rtk git commit -m "HWPX 템플릿 컴파일러 1단계 검증"
```

## Final Verification

- [ ] `rtk git diff --check`가 성공한다.
- [ ] `rtk cargo test`가 성공하고 기존 ignored 22건 외 Task 4 신규 ignored가 0건이다.
- [ ] `rtk cargo build --release`가 성공한다.
- [ ] 생성 HWPX를 `DocumentCore::from_bytes`가 다시 로드한다.
- [ ] 선택 경계 앞 문단의 controls 심층 표현과 `doc_info`/전역 리소스 의미가 유지된다.
- [ ] 기존 passthrough aux 엔트리는 바이트가 동일하고, `content.hpf`의 metadata·manifest 리소스 참조·spine 의미가 유지된다.
- [ ] 작업 결과와 미지원 범위가 `docs/logs`에 기록된다.
