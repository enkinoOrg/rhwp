# Enkino Upstream 동기화 정책 (Upstream Sync)

이 문서는 오픈소스 원본 rhwp 저장소(`upstream/main` 또는 `upstream/devel`)의 최신 변경사항을 Enkino 전용 브랜치에 동기화할 때 적용하는 정책과 절차를 설명합니다.

## 1. 동기화 원칙 (Upstream-First Patch Layer Policy)

1. **최소 변경 레이어 유지**: Enkino 전용 커스터마이징(Cloudflare Workers 호스팅, Enkino 기본 URL 안내, strict `suppressDialogs` 옵션 검증, 대화상자 정책)은 업스트림 핵심 엔진 코드를 최소한으로 수정하는 독립 커밋 패치 레이어로 관리합니다.
2. **업스트림 추적**: 원본 오픈소스 rhwp의 `upstream/main` 및 `upstream/devel` 브랜치를 지속적으로 모니터링하고 추적합니다.

## 2. 동기화 수행 절차

### Step 1: Upstream 원격 브랜치 최신화

```bash
git fetch upstream
```

### Step 2: 리베이스 및 충돌 해결

Enkino 작업 브랜치를 `upstream/main` 기준 최신 위치로 리베이스합니다.

```bash
git rebase upstream/main
```

리베이스 중 충돌 발생 시:
- 핵심 엔진 및 UI 변경사항은 upstream 코드를 우선 반영합니다.
- Enkino 패치 레이어(`wrangler.jsonc`, `public/_headers`, Enkino 대화상자 정책 모듈)의 계약이 깨지지 않도록 수동 조정합니다.

### Step 3: 계약 및 통합 테스트 검증

동기화 후 다음 검증 스크립트를 실행하여 Enkino 계약이 유지되는지 확인합니다:

```bash
# SDK 및 호스팅 계약 테스트
rtk proxy node --test tests/enkino-integration-docs.test.mjs
rtk proxy node --test npm/editor/tests/*.test.mjs

# Studio 정책 테스트
rtk proxy node --test rhwp-studio/tests/enkino-load-policy.test.ts rhwp-studio/tests/autosave-recovery-policy.test.ts rhwp-studio/tests/enkino-host-policy.test.ts

# Rust 라이브러리 검증
rtk cargo test --lib
```

## 3. 동기화 이력 기록

모든 upstream 동기화 및 재적용 작업은 `docs/logs/YYYY-MM-DD-upstream-동기화-enkino-재적용.md`에 작업 일지, RED/GREEN 검증 결과, 커밋 SHA 목록을 세부 기록합니다.
