# Enkino RHWP SDK 배포 정책 명시

## 배경

공용 RHWP 연동 문서에 `@rhwp/editor@0.7.19` npm 발행이 인증 부족으로 실패했다고 기록돼 있었다. 그러나 Enkino의 운영 의도는 원본 프로젝트의 npm package에 자체 수정본을 올리는 것이 아니라, Enkino가 관리하는 저장소와 공용 Studio를 독립적으로 운영하는 것이다. 후임자가 npm 인증 문제를 해결해야 할 미완료 작업으로 오해하지 않도록 배포 책임과 소비자 설치 기준을 명확히 했다.

## 결정

- Enkino 수정 SDK는 원본 `@rhwp/editor` npm namespace에 발행하지 않는다.
- 외부 프로젝트는 Enkino 저장소의 검증된 고정 커밋에서 `npm/editor/index.js`와 `index.d.ts`를 vendor한다.
- 현재 자체 SDK 기준은 transferable 바이너리 커밋 `9fc2bcbda1f5787c60b89244d01b4ff80e3adeab`이다.
- 원본 npm package의 최신 버전과 Enkino 자체 SDK 기준은 서로 독립적으로 관리한다.
- 자체 SDK 기준을 변경할 때는 연동 테스트, Studio 배포, 소비자 문서와 작업 로그를 같은 변경에서 갱신한다.

## 변경 내용

- 루트 README와 상세 연동 가이드에 자체 배포 정책을 명시했다.
- 프레임워크 공통 예제와 Next.js 예제의 vendor SHA를 현재 기준으로 통일했다.
- 기존 작업 로그의 npm 인증 실패 표현을 의도적인 자체 운영 결정으로 정정했다.

## 검증

- `npm run test:integration-guide`로 문서와 예제 계약을 확인한다.
- `git diff --check`로 변경 형식을 확인한다.
