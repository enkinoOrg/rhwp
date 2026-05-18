# Stage 5 완료보고서 — Task #987

## 단계 목표

쪽 번호를 한컴 정답지대로 **쪽 테두리 하단 경계선 아래쪽** 여백에 배치
(sample16, 본문 내 PageNumberPos pos=5).

## 변경 내용

### 1. `page_border_bottom_y` 헬퍼 추가 (`layout.rs:932`)

쪽 테두리 하단 변 y 산출 (build_page_borders 와 동일 공식).
**body 기준 테두리일 때만 Some** 반환:

- body 기준 테두리 = 본문을 감쌈 → 쪽 번호는 테두리 *바깥(아래)* (sample16)
- paper 기준 테두리 = 종이 전체를 감쌈 → 쪽 번호는 테두리 *안쪽* (aift.hwp)
  → paper 기준은 None 반환, 기존 로직 유지

### 2. `build_page_number` 시그니처 + y 보정 (`layout.rs:1497,1583`)

- `page_border_fill: Option<&PageBorderFill>` 인자 추가 (호출부 `:628`)
- 꼬리말 위치 + body 기준 테두리 + **이 페이지에 테두리 실제 그려질 때**
  (`!hide_border`): `y = border_bottom + gap + font_size`
  - gap = `font_size * 0.6` (시각 판정으로 확정 예정)
- 그 외(테두리 없음/paper 기준/hide_border): 기존 footer 중앙 로직 유지

## 회귀 추적 (2회 수정)

| 회귀 | 원인 | 수정 |
|------|------|------|
| 1차: aift p1 실패 | `page_border_fill` 이 섹션 레벨이라 hide_border 페이지에도 Some | `!hide_border` 조건 추가 (build_page_borders 와 동일 판정) |
| 2차: aift p6/p7 실패 | aift 는 **paper 기준** 테두리 — 쪽 번호가 테두리 안쪽이 정답(Task #634) | `page_border_bottom_y` 를 **body 기준만** Some 으로 한정 |

→ body 기준(sample16)만 보정, paper 기준(aift)은 기존 동작.
   포맷이 아닌 **테두리 기준(paper/body)** 으로 분기 — 논리적 일관.

## 측정 결과 (sample16 page 3 = index 2)

| 항목 | y 좌표 (px) |
|------|-------------|
| 쪽 테두리 하변 이중선 | 1086.1 / 1088.2 |
| **쪽 번호 "- 1 -" baseline** | **1113.1** (테두리 하변 아래) |

쪽 번호가 쪽 테두리 하단 경계선 아래 footer 여백에 배치 — 한컴 동작 방향 일치.

## 검증

| 항목 | 결과 |
|------|------|
| `cargo test` | ✅ 1476 passed, 0 failed |
| `cargo test --lib test_634` (aift 쪽번호) | ✅ 8 passed, 0 failed (회귀 해소) |
| `cargo clippy -- -D warnings` | ✅ 0 warnings |
| sample16 쪽 번호 위치 | ✅ 테두리 하변 아래 (y=1113.1) |
| aift.hwp 쪽 번호 위치 | ✅ 기존 y=1079.16 복원 (paper 기준) |

산출물: `output/poc/task987_stage5/hwp3-sample16_003.svg`

## 시각 판정 요청

sample16 페이지 3 쪽 번호 "- 1 -" 가 쪽 테두리 하단 경계선 **아래쪽**
여백에 배치됨. 한컴 정답지와 위치 정합 여부 + gap(테두리~쪽번호 간격,
현재 font_size*0.6 ≈ 6px) 적정 여부 작업지시자 시각 판정 요청.

## 다음 단계

시각 판정 통과 시 최종 보고서 작성 + Stage 1~5 통합 + PR #971 stash 복귀.
