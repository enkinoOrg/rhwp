# Enkino RHWP 연동 가이드 (Integration Guide)

이 문서는 Enkino 소비자 웹 애플리케이션에서 `@rhwp/editor` SDK를 통해 rhwp 에디터를 임베드하고 운영할 때 준수해야 하는 연동 규격 및 프로토콜을 설명합니다.

## 1. SDK 개요 및 설치

`@rhwp/editor` 패키지는 `iframe` 통신 모듈(`MessageChannel` v1 및 `postMessage`)을 통해 `rhwp-studio` 에디터 UI를 웹 애플리케이션에 손쉽게 임베드할 수 있도록 지원합니다.

```bash
npm install @rhwp/editor
```

## 2. Enkino 필수 연동 설정

### 2.1 명시적 `studioUrl` 지정

업스트림 SDK의 기본 URL은 `https://edwardkim.github.io/rhwp/`입니다. 따라서 Enkino 전용 호스팅 환경을 사용하기 위해 소비자는 `createEditor` 호출 시 반드시 Cloudflare Workers URL을 명시해야 합니다.

```javascript
import { createEditor } from '@rhwp/editor';

const editor = await createEditor('#editor', {
  studioUrl: 'https://rhwp.enkinokorea.workers.dev/',
  renderer: 'canvas2d'
});
```

### 2.2 대화상자 억제 (`suppressDialogs: true`) 및 원본 처리 연동

`loadFile` 호출 시, 로드 과정에서 발생하는 안내 팝업(HWPX 비표준 검증 대화상자, 로컬 글꼴 권한 프롬프트)을 억제하려면 `suppressDialogs` 옵션에 명시적으로 boolean `true`를 전달해야 합니다.

```javascript
// Enkino 소비자 로드 예시: 대화상자 억제 지정
await editor.loadFile(buffer, 'document.hwpx', {
  suppressDialogs: true
});
```

- **엄격한 Boolean 검증**: `suppressDialogs` 옵션은 명시적인 boolean `true` 값인 경우에만 대화상자를 억제합니다. `false`, `undefined`, 또는 문자열 `'true'` 전달 시에는 억제되지 않고 기존 안내 팝업 흐름을 유지합니다.
- **원본 상태 열기 및 자동 보정 안 함**: `suppressDialogs: true` 지정 시, HWPX 검증 팝업이 표시되지 않고 문서를 원본 상태 그대로 엽니다. 자동 보정(line-segment automatic reflow)을 수행하지 않고 사용자가 명시적으로 수동 보정을 선택하지 않는 한 원본 구조를 유지합니다.

### 2.3 SDK 옵션 지원 안내

`@rhwp/editor` SDK는 public 생성자 및 로드 옵션(`studioUrl`, `suppressDialogs`, `width`, `height`, `renderer`, `requestTimeoutMs`, `handshakeTimeoutMs` 등)을 완벽하게 지원합니다.

## 3. 보안 및 크로스 오리진 메시지 검증

SDK와 Studio는 `MessageChannel` v1 및 `postMessage` 전송 계층에서 엄격한 오리진 및 소스 검증을 수행합니다.

- **`event.origin` 검증**: 허용된 HTTP(S) origin 교환이 이루어졌는지 확인하며 불투명 오리진(`null`) 메시지는 즉시 차단됩니다.
- **`event.source` 검증**: 메시지를 발송한 `window` 개체가 실제 바인딩된 `iframe.contentWindow`와 동일한지 확인하여 크로스 사이트 메시지 위조 공격을 방지합니다.

## 4. 저장 및 완료 통지 흐름

문서 내보내기(`exportHwp`, `exportHwpx`, `exportHml`) 후 호스트 서버에 영속화가 완료되면 반드시 `notifySaved`를 호출하여 미저장(dirty) 상태 해제 및 자동복구 임시 데이터를 삭제해야 합니다.

```javascript
const bytes = await editor.exportHwpx();
await uploadToEnkinoServer(bytes);
await editor.notifySaved();
```
