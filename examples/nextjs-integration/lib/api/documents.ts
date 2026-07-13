export type DocumentVersion = number

export interface DocumentFile {
  bytes: ArrayBuffer
  fileName: string
  version: DocumentVersion
}

export interface SaveDocumentFileInput {
  bytes: Uint8Array
  version: DocumentVersion
}

export interface SaveDocumentFileResult {
  version: DocumentVersion
}

const CANONICAL_DOCUMENT_VERSION = /^(0|[1-9]\d*)$/

// 문서 API 오류 표현
export class DocumentApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'DocumentApiError'
  }
}

// 다른 저장본이 먼저 만들어진 경우의 오류 표현
export class DocumentVersionConflictError extends DocumentApiError {
  constructor(public readonly currentVersion?: DocumentVersion) {
    super('다른 사용자가 문서를 먼저 저장했습니다.', 409)
    this.name = 'DocumentVersionConflictError'
  }
}

// 문서 file API 경로 생성
function documentFileEndpoint(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/file`
}

// 헤더의 canonical nonnegative safe integer version 파싱
function parseDocumentVersion(value: string | null): DocumentVersion {
  if (!value || !CANONICAL_DOCUMENT_VERSION.test(value)) {
    throw new Error('서버가 유효하지 않은 문서 version을 반환했습니다.')
  }

  const version = Number(value)

  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error('서버가 유효하지 않은 문서 version을 반환했습니다.')
  }

  return version
}

// 인코딩된 문서 파일명 헤더 파싱
function parseDocumentFileName(encodedFileName: string | null): string {
  if (!encodedFileName) return 'document.hwpx'

  try {
    return decodeURIComponent(encodedFileName)
  } catch {
    return 'document.hwpx'
  }
}

// 저장 요청 version의 canonical 형식 검증
function formatIfMatch(version: DocumentVersion): string {
  const value = String(version)

  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !CANONICAL_DOCUMENT_VERSION.test(value)
  ) {
    throw new Error('저장 기준 version이 유효하지 않습니다.')
  }

  return `"${value}"`
}

// 응답 오류 메시지 추출
async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `문서 요청에 실패했습니다. (${response.status})`
  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) return fallback

  const body = (await response.json()) as { error?: string }

  return body.error ?? fallback
}

// HWPX 원본과 현재 version 조회
export async function getDocumentFile(documentId: string): Promise<DocumentFile> {
  const response = await fetch(documentFileEndpoint(documentId), {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw new DocumentApiError(await readErrorMessage(response), response.status)
  }

  const version = parseDocumentVersion(response.headers.get('X-Document-Version'))

  return {
    bytes: await response.arrayBuffer(),
    fileName: parseDocumentFileName(response.headers.get('X-Document-File-Name')),
    version,
  }
}

// 기준 version을 포함해 새 HWPX version 저장
export async function saveDocumentFile(
  documentId: string,
  input: SaveDocumentFileInput,
): Promise<SaveDocumentFileResult> {
  const response = await fetch(documentFileEndpoint(documentId), {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/haansofthwpx',
      'If-Match': formatIfMatch(input.version),
    },
    body: input.bytes,
  })

  if (response.status === 409) {
    const body = (await response.json()) as { currentVersion?: DocumentVersion }

    throw new DocumentVersionConflictError(body.currentVersion)
  }

  if (!response.ok) {
    throw new DocumentApiError(await readErrorMessage(response), response.status)
  }

  return (await response.json()) as SaveDocumentFileResult
}
