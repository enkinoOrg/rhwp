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

  const version = Number(response.headers.get('X-Document-Version'))

  if (!Number.isInteger(version) || version < 0) {
    throw new Error('서버가 유효하지 않은 문서 version을 반환했습니다.')
  }

  return {
    bytes: await response.arrayBuffer(),
    fileName: response.headers.get('X-Document-File-Name') ?? 'document.hwpx',
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
      'If-Match': `"${input.version}"`,
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
