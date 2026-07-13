# Upstream 동기화

## 배경

이 저장소는 RHWP 전체 소스를 장기 고립 fork로 운영하지 않고 upstream 개선을 계속 받아야 한다. Enkino 전용 변경과 upstream 변경을 구분해 충돌 범위를 작게 유지한다.

## 원격 구성

- `origin`: `git@github.com:enkinoOrg/rhwp.git`
- `upstream`: `git@github.com:edwardkim/rhwp.git`

## 동기화 절차

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
```

Enkino 패치를 별도 브랜치나 commit으로 유지하는 동안에는 upstream 갱신 뒤 해당 commit을 rebase하거나 cherry-pick한다. 충돌 가능성이 가장 높은 파일은 `rhwp-studio/src/main.ts`와 `rhwp-studio/vite.config.ts`다.

## 동기화 후 필수 확인

```bash
npm --prefix rhwp-studio test
npm run build
npm run deploy:dry-run
```

정책 테스트가 로컬 글꼴 안내 호출의 재도입을 감지한다. 검증 없이 upstream 변경을 운영 배포하지 않는다.
