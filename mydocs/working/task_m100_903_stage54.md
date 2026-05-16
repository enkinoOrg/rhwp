# Task m100 #903 Stage 54 작업 기록

## 1. 목적

Stage53에서 성공한 최소 조합을 실제 구현 경로에 반영한다.

```text
1. BIN_DATA metadata/raw_data 보강
2. BodyText CTRL_HEADER payload 보존/합성
```

Stage52의 `align.vertical -> ParaShape.attr1 bits 20..21` 매핑은 이미 산출물에 반영된
no-op 축으로 확인되었으므로 이번 stage의 주 구현 대상에서 제외한다.

## 2. 기준

입력:

```text
samples/hwpx/hwpx-h-01.hwpx
```

정답지:

```text
samples/hwpx/hancom-hwp/hwpx-h-01.hwp
```

Stage53 positive:

```text
output/poc/hwpx2hwp/task903/stage53_current_impl_gap_probe/03_current_plus_bindata_ctrl_header.hwp
```

## 3. 구현 대상

### 3.1 BIN_DATA

Stage53 DocInfo 비교에서 current와 positive의 차이는 다음과 같았다.

```text
current: raw_data 없음, attr=0x0, status=NotAccessed
positive: raw_data 있음, attr=0x101, status=Success
```

HWPX embedded BinData에 대해 HWP 저장 직전 `attr=0x0101`, `status=Success`를
materialize한다.

### 3.2 CTRL_HEADER

Stage53에서 `CTRL_HEADER` raw graft가 성공 조건이었다.
Stage54에서는 raw graft가 아니라 모델 기반 합성 경로를 보강한다.

우선 표 `raw_ctrl_data` 합성 시 HWPX 출처라는 이유로 attr를 0으로 되돌리는 경로를 제거하고,
`CommonObjAttr`에서 pack한 attr를 유지한다.

## 4. 생성 명령

```bash
cargo test --test hwpx_to_hwp_adapter task903_stage54_generate_minimal_impl_candidate -- --nocapture
```

## 5. 생성 파일

출력 폴더:

```text
output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/
```

판정 대상:

```text
output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/hwpx-h-01.hwp
```

## 6. 작업지시자 판정 요청

| 파일 | 한컴 판정 유형 | 이미지 출력 | 표/셀 배치 | 셀 텍스트 클리핑 | 마지막 페이지 출력 | rhwp-studio 판정 | 비고 |
|---|---|---|---|---|---|---|---|
| `output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/hwpx-h-01.hwp` | 성공 | 성공 | 성공 | 성공 | 성공 | 성공 |  |

## 7. 구현 내용

### 7.1 BIN_DATA metadata 보강

`src/document_core/converters/hwpx_to_hwp.rs`에 HWPX embedded BinData 보정 경로를
추가했다.

```text
attr: 0x0101
status: Success
raw_data: None
DocInfo dirty 처리
```

Stage54 리포트에서 current model은 positive model과 같은 값으로 정렬되었다.

```text
attr=0x101
type=Embedding
compression=Default
status=Success
```

### 7.2 table CTRL_HEADER attr 보존

HWPX table의 `raw_ctrl_data`를 합성한 뒤, 일부 guard에서 attr를 다시 0으로
되돌리던 경로를 제거했다. 이제 `CommonObjAttr`에서 pack된 attr를 유지한다.

### 7.3 HWPX table/picture parser 보강

`src/parser/hwpx/section.rs`에서 HWPX table의 다음 속성을 `CommonObjAttr`에 반영했다.

```text
id/instid -> instance_id
zOrder -> z_order
```

또한 picture의 `shapeComment`를 `CommonObjAttr.description`에 반영했다.
이로 인해 그림 CTRL_HEADER의 description payload 길이는 positive와 더 가까워졌다.

## 8. 생성 결과

명령:

```bash
cargo test --test hwpx_to_hwp_adapter task903_stage54_generate_minimal_impl_candidate -- --nocapture
```

결과:

```text
test task903_stage54_generate_minimal_impl_candidate ... ok
```

생성 파일:

```text
output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/hwpx-h-01.hwp
```

생성 정보:

```text
bytes=374784
blake3-short=a3c5db8a506d9b09
rhwp reload=ok, pages=9
```

참고 SHA-256:

```text
stage54 candidate:
734ebf8c46d2ca1346e2092409c2ef0dc72dd9eff0bf4449ddf012e3b3fcf1b4

stage53 success probe 03:
42ecb237d15923ccfbb35427776814ecf75e1d2e6e8c4cfa30edfe8aff69130c
```

두 파일은 동일하지 않다. Stage54는 raw graft가 아니라 현재 구현 경로의 최소 보강 후보이므로,
한컴/rhwp-studio 시각 판정이 필요하다.

## 9. 리포트

생성 리포트:

```text
output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/stage54_generation.md
output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/current_vs_positive_docinfo.md
output/poc/hwpx2hwp/task903/stage54_minimal_impl_candidate/current_vs_positive_section0.md
```

DocInfo:

```text
BIN_DATA model 값은 positive와 정렬됨
DocInfo record count는 동일
```

Section0:

```text
section0 records: current=7879, positive=7879
CTRL_HEADER diff: 29건 잔존
TABLE diff: 21건 잔존
LIST_HEADER diff: 524건 잔존
```

남은 diff가 모두 시각 실패로 이어지는 것은 아니므로, 우선 한컴/rhwp-studio 판정을 받는다.

## 10. 판정 결과와 결론

작업지시자 판정:

```text
한컴 판정 유형: 성공
이미지 출력: 성공
표/셀 배치: 성공
셀 텍스트 클리핑: 성공
마지막 페이지 출력: 성공
rhwp-studio 판정: 성공
```

Stage54 최소 구현 후보가 통과했다.

따라서 #903의 `samples/hwpx/hwpx-h-01.hwpx` 저장 실패/조판 실패의 핵심 원인은
다음 구현 축으로 정리한다.

```text
1. HWPX embedded BIN_DATA metadata가 HWP 저장 관례로 materialize되지 않음
2. HWPX table/object CTRL_HEADER payload 합성에 필요한 CommonObjAttr 필드가 누락됨
```

이번 구현에서 회복된 구체 항목:

```text
- BinData attr/status 보강
- table CTRL_HEADER attr 유지
- HWPX table id/zOrder 파싱
- HWPX picture shapeComment 파싱
```

Stage54는 raw graft 없이 current implementation path에서 성공했으므로,
이번 변경은 POC 결과를 실제 adapter/parser 경로에 반영한 것으로 판단한다.
