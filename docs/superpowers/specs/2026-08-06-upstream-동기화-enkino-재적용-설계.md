# Upstream 동기화 Enkino 재적용 설계

## 목표

`edwardkim/rhwp` `main` 커밋
`2dced7bfe10c6597cead634264c7c1781c01f1e7`을 기준으로 upstream 구조와
검증 기준선을 유지하면서 Enkino 운영에 필요한 최소 패치만 재적용한다.

통합본은 다음 계약을 동시에 만족해야 한다.

- upstream의 Rust 문서 모델·렌더러·Studio 기능을 기준으로 삼는다.
- upstream `npm/editor/transport.js`의 v1 MessageChannel, legacy fallback,
  exact-origin/source 검증, timeout, destroy 구조를 보존한다.
- Enkino Studio는 Cloudflare Worker
  `https://rhwp.enkinokorea.workers.dev`에 배포할 수 있어야 한다.
- 임베드 `loadFile` 요청의 `params.suppressDialogs` 값이 정확한 boolean
  `true`일 때만 로드 대화상자를 생략한다.
- 일반 파일 열기, URL 로드, `suppressDialogs` 누락·`false`·문자열
  `"true"`는 실제로 남은 HWPX 검증 경고를 사용자에게 표시한다.
- HWPX 로드 자동 reflow로 해결된 `LinesegArrayEmpty`는 검증 보고에서
  제거하고, 해결되지 않은 경고는 유지한다.
- 문서 로드 중 로컬 글꼴 권한을 자동 요청하지 않고 대체 글꼴로
  렌더링한다.
- iframe 임베드에서 초기 자동복구 대화상자와 HWPX 저장 안내를
  표시하지 않는다.

## 비목표

- upstream 기능을 Enkino 이전 버전으로 되돌리지 않는다.
- 61개 Enkino 커밋을 순서대로 rebase하거나 원본 파일 전체를 덮어쓰지
  않는다.
- `npm/editor/index.js`의 upstream 기본 Studio URL
  `https://edwardkim.github.io/rhwp/`를 변경하지 않는다.
- 공개 npm 패키지 발행, 운영 Worker 배포, upstream PR은 이 통합 구현의
  자동 범위가 아니다.
- `md-to-hwpx`의 `.github/workflows/deploy.yml`을 변경·실행하지 않는다.
- upstream 구조와 무관한 대규모 리팩터링을 하지 않는다.

## 접근법 비교

### 1. 최신 upstream 위에 Enkino 최소 패치 재적용 — 선택

새 upstream HEAD에서 시작해 호스팅, 임베드 정책, lineseg 후검증,
문서를 독립된 단위로 재작성한다. upstream 아키텍처와 테스트를 유지하며
각 정책을 RED-GREEN 회귀 테스트로 이식할 수 있다. Enkino 이전 커밋 이력은
그대로 재사용하지 않지만 충돌·회귀 위험이 가장 낮다.

### 2. `enkino/self-host`에 upstream 직접 merge

이력은 연속적이지만 8개 텍스트 충돌과 4개 자동 병합 리뷰가 필요하다.
특히 이전 `index.js` 전체를 선택하면 upstream `transport.js`의 보안·프로토콜
개선을 잃을 수 있어 선택하지 않는다.

### 3. Enkino wrapper를 별도 패키지로 분리

향후 동기화 비용을 줄일 수 있지만 Studio 내부 로드·검증·글꼴 UI 정책까지
외부 wrapper로 분리하려면 범위가 크게 늘어난다. 현재 동기화에는 불필요하다.

## 기준 아키텍처

통합 브랜치 `enkino/upstream-2dced7b-sync`는 upstream HEAD를 바로 부모로 두고,
Enkino 기능을 다음 경계로 나눈다.

1. **호스팅 경계**: Cloudflare 설정·헤더·빌드 스크립트만 추가한다.
2. **SDK 경계**: upstream transport를 그대로 사용하고 `loadFile` option 정규화와
   Enkino 연동 문서만 변경한다.
3. **Studio 정책 경계**: 파일 로드 결과와 UI 표시 조건만 변경하고
   렌더러·편집·MessageChannel을 변경하지 않는다.
4. **Rust 검증 경계**: 로드 reflow 후 HWPX 보고만 현재 문서 상태로
   갱신한다.

각 경계는 독립적으로 테스트·커밋하고 다음 경계로 넘어간다.

## 컴포넌트 설계

### Cloudflare Workers 호스팅

다음 Enkino 파일은 upstream 구조에 새 호스팅 레이어로 추가한다.

- 루트 `package.json`, `package-lock.json`: Studio 테스트·WASM·production build·Wrangler
  dry-run/deploy 진입점
- `wrangler.jsonc`: Worker `rhwp`와 `rhwp-studio/dist` 정적 자산 설정
- `rhwp-studio/public/_headers`: 로컬 글꼴 권한 차단과 기본 보안 헤더
- `rhwp-studio/tests/enkino-host-policy.test.ts`: Worker 이름, 정적 경로,
  `Permissions-Policy: local-fonts=()` 계약 검증

upstream `.github/workflows/deploy-pages.yml`은 Enkino 브랜치에서 삭제한다. 다른
upstream CI를 불필요하게 수정하지 않는다. 특히 별도 저장소인
`md-to-hwpx`의 workflow는 접근하지 않는다.

### SDK와 프로토콜

`npm/editor/transport.js`와 해당 테스트는 upstream을 권위로 삼는다.

- `DEFAULT_STUDIO_URL`은 `https://edwardkim.github.io/rhwp/`를 유지한다.
- Enkino 소비자는 `createEditor(..., { studioUrl:
  'https://rhwp.enkinokorea.workers.dev' })`를 명시한다.
- `RhwpEditor.loadFile(data, fileName, options)`는
  `suppressDialogs: options.suppressDialogs === true`를 전달한다.
- 옵션 누락·`false`·`"true"`·truthy 객체는 모두 `false`로 정규화한다.
- transferable binary 복사, 세션 ID, exact origin/source, response envelope,
  request timeout, destroy 동작은 변경하지 않는다.

`npm/editor/index.d.ts`, `npm/editor/README.md`, Enkino 연동 가이드는 이 계약과
같아야 한다. 이전의 “공개 SDK가 options를 전달하지 못한다”는 설명은
최신 upstream SDK에서 더 이상 사실이 아니므로 갱신한다.

### Studio 로드 정책

Studio는 로드 요청의 소스와 엄격히 정규화된 option에 따라 UI를
결정한다.

- embed router는 원본 `params.suppressDialogs === true`만 handler에 `true`로 넘긴다.
- `loadBytes`/`initializeDocument`는 boolean 값을 소비하되 upstream transport와
  session routing을 변경하지 않는다.
- HWPX `validation_report.count > 0`이고 `suppressDialogs !== true`면
  `showValidationModalIfNeeded` 결과를 기다린다.
- `suppressDialogs === true`면 모달을 만들지 않고 원본 상태로 연다.
- top-level 일반 파일·URL 로드는 `suppressDialogs: false`로 취급한다.
- 자동 보정 버튼이 존재하는 기존 모달을 복원할 때는 사용자가 명시적으로
  선택한 경우에만 `reflowLinesegs()`를 호출한다.

로컬 글꼴 확인은 HWPX 검증 모달과 분리한다. 문서 로드 경로는
`queryLocalFonts` 권한을 자동 요청하지 않고 웹 대체 글꼴로 즉시 렌더링한다.
나중에 사용자가 설정에서 명시적으로 로컬 글꼴을 확인하는 기능은 이 계약의
범위 밖이다.

iframe 임베드에서는 부모 애플리케이션의 수명주기와 저장 UI를 존중한다.
로드 시작 전 자동복구 제안과 로드 후 HWPX 저장 안내를 표시하지 않는다.
upstream에서 해당 안내가 이미 제거됐다면 코드를 다시 추가하지 않고 “없음”을
회귀 테스트로 고정한다.

### Rust lineseg 검증

`DocumentCore::from_bytes` 로드 순서는 upstream을 권위로 삼는다.

1. 문서와 HML metadata를 파싱한다.
2. HWPX/HML/HWP5-origin 조건을 계산한다.
3. reflow 전 검증 보고를 생성해 HWP/HWP3 기존 계약을 보존한다.
4. upstream `reflow_zero_height_paragraphs` 및 placeholder 정리를 실행한다.
5. 일반 HWPX이고 HWP5-origin marker가 아닌 경우만 현재 문서를 다시
   검증해 `validation_report`를 교체한다.
6. HML과 HWP/HWP3의 선검증 보고 계약은 변경하지 않는다.

재검증은 reflow를 다시 실행하지 않고 보고만 갱신한다. upstream에 추가된
HML, layout profile, cell-empty, missing placeholder 처리를 삭제하거나 되돌리지 않는다.

### 문서와 운영 계약

Enkino 문서는 `docs/tech` 및 `docs/logs`에 두고 사용자에게 다음을
명시한다.

- Cloudflare Studio URL은 소비자가 `studioUrl`로 명시한다.
- 최신 공개 SDK는 `loadFile` 세 번째 options 인자를 지원한다.
- `suppressDialogs: true`는 모달 생략이지 자동 보정 활성화가 아니다.
- 옵션을 누락하면 대화형 동작을 유지한다.
- `event.origin`/`event.source`를 우회하거나 `targetOrigin: '*'`를 사용하지
  않는다.

## 데이터 흐름

```text
Enkino consumer
  └─ createEditor(..., { studioUrl: Cloudflare URL })
      └─ upstream EditorTransport
          └─ v1 MessageChannel / legacy exact-origin fallback
              └─ embed router
                  ├─ params.suppressDialogs === true → true
                  └─ 그 외                           → false
                      └─ Studio loadBytes
                          ├─ Rust parse + load reflow + HWPX revalidation
                          ├─ true  → 잔여 경고 모달 생략
                          └─ false → 잔여 경고 모달 표시
```

binary는 `transport.js`에서 전송용 복사본을 만들어 transferable로 보낸다.
호출자 buffer를 detach하지 않고 응답은 session ID, protocol version, request ID,
origin/source 검증을 통과해야 한다.

## 오류 및 보안 처리

- 프로토콜 버전·session·origin·source가 틀리면 응답을 무시하거나 구조화된
  오류로 종료한다.
- `loadFile` 진행 중 타임아웃·destroy·postMessage 실패가 발생하면 pending
  timer와 request를 정리한다.
- 문자열·숫자·객체 `suppressDialogs`는 엄격한 `true`로 취급하지 않는다.
- 파일 로드 중 로컬 글꼴 API 권한 오류로 전체 로드를 실패시키지
  않고 대체 글꼴을 사용한다.
- 검증 모달에서 사용자가 ‘그대로 열기’를 선택하면 문서를 변경하지
  않는다. ‘자동 보정’은 명시적 사용자 선택에서만 실행한다.

## TDD 검증 설계

각 정책 단위는 생산 코드보다 회귀 테스트를 먼저 작성하고 의도한 이유로
실패함을 확인한다.

### Cloudflare 호스팅

- Worker 이름이 `rhwp`, 자산 경로가 `rhwp-studio/dist`인지 검증한다.
- `_headers`의 `Permissions-Policy: local-fonts=()`와 보안 헤더를 검증한다.
- upstream 상태에서 호스팅 파일이 없어 RED임을 확인한다.

### SDK

- 기본 Studio URL이 upstream GitHub Pages로 유지되는지 특성 테스트로
  고정한다.
- options 누락·`false`·`true`·`"true"`의 payload를 모두 검증한다.
- 수정 전 upstream에서 options 누락이 `true`로 전송되어 RED임을 확인한다.
- 기존 `transport.js` 보안·timeout·destroy·transferable 테스트를 그대로 통과시킨다.

### Studio

- raw embed 요청에서 boolean `true`만 handler의 `suppressDialogs=true`로 도달한다.
- HWPX 잔여 경고가 있을 때 top-level·옵션 누락·`false`는 모달을 호출한다.
- boolean `true`는 모달을 호출하지 않고 자동 보정도 하지 않는다.
- 문서 로드가 `queryLocalFonts`를 호출하지 않는다.
- iframe에서 자동복구·HWPX 저장 안내가 없고 top-level 정책은 의도대로
  유지된다.

### Rust

- 빈 lineseg HWPX를 직렬화·로드해 reflow 후 lineseg가 생성되고 보고가
  비어 있는지 검증한다.
- 이 테스트가 수정 전 `LinesegArrayEmpty`로 RED임을 확인한다.
- 해결되지 않는 `LinesegTextRunReflow` 경고는 유지되는지 검증한다.
- HWP/HWP3, HML, HWP5-origin HWPX 검증 보고 계약을 별도 대조군으로
  고정한다.

## 통합 순서와 커밋 경계

1. 호스팅 구성·호스트 정책 테스트
2. SDK strict `suppressDialogs` 계약·문서
3. Studio 검증 모달·로컬 글꼴·임베드 UI 정책
4. Rust HWPX lineseg 후검증
5. Enkino 외부 연동 문서·운영 문서
6. 자동 병합 후보 4개
   (`.github/workflows/npm-publish.yml`, `.gitignore`, `npm/editor/README.md`,
   `rhwp-studio/vite.config.ts`) 수동 리뷰
7. Rust lib·Studio·Enkino 통합 테스트, release WASM, production build,
   Wrangler dry-run

각 1~5단계는 RED 확인, 최소 GREEN, 관련 테스트 전체 통과, 한국어 커밋
순서로 종료한다. 단계 간 파일을 섞지 않는다.

## 자동 병합 후보 리뷰

- `.github/workflows/npm-publish.yml`: upstream Node·wasm-pack·SDK 테스트 순서를
  유지하고 Enkino 정책이 필요한 부분만 추가한다.
- `.gitignore`: upstream 새 ignore를 유지하고 `.wrangler/`, `.worktrees/`,
  `.codegraph/` 필요성을 각각 확인한다.
- `npm/editor/README.md`: upstream 신규 options API와 Enkino strict boolean 계약,
  명시적 `studioUrl` 예제가 코드와 일치해야 한다.
- `rhwp-studio/vite.config.ts`: upstream samples/subsecond/PWA 구성을 유지하고
  Cloudflare base·output·WASM cache 호환성만 보강한다.

## 중단 조건

다음 상태에서는 임의로 범위를 늘리지 않고 사용자에게 보고한다.

- v1 MessageChannel을 유지하면서 기존 Enkino 소비자와 호환될 수 없는 프로토콜
  파괴가 확인된 경우
- HWPX 후검증이 upstream의 HML·HWP5-origin·layout profile 계약을 회귀시키는
  경우
- Enkino 정책 테스트와 upstream 보안 테스트를 동시에 통과시킬 수 없는
  경우
- `md-to-hwpx` 배포 workflow나 다른 저장소 변경이 필요해지는 경우
- 공개 SDK 기본 URL을 Enkino Worker로 변경해야만 통합이 가능해지는 경우
- 새 dependency·대규모 리팩터링·운영 배포가 필요해지는 경우

## 완료 기준

- 전체 생산 변경에 의도를 고정하는 TDD 회귀 테스트가 있다.
- upstream 프로토콜·렌더러·편집 테스트와 Enkino 정책 테스트가 통과한다.
- `wasm-pack 0.15.0 build --target web --release` 후 Studio production build가
  통과한다.
- Wrangler dry-run이 Worker `rhwp`와 `rhwp-studio/dist` 자산을 정상적으로
  인식한다.
- 사용자 미커밋 파일과 다른 저장소는 변경되지 않는다.
- 동기화 결과와 검증·미수행 항목이 `docs/logs` 작업 로그에
  기록된다.
- 통합 브랜치 커밋까지만 생성하며 푸시·배포는 별도 승인을 받는다.
