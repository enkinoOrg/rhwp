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

export interface DocumentDownloadHeadersInput {
  fileName: string
  version: DocumentVersion
  byteLength: number
  contentType: string
}

const CANONICAL_DOCUMENT_VERSION = /^(0|[1-9]\d*)$/

// 문서 API 오류 표현
export class DocumentApiError extends Error {
  public readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'DocumentApiError'
    this.status = status
  }
}

// 다른 저장본이 먼저 만들어진 경우의 오류 표현
export class DocumentVersionConflictError extends DocumentApiError {
  public readonly currentVersion?: DocumentVersion

  constructor(currentVersion?: DocumentVersion) {
    super('다른 사용자가 문서를 먼저 저장했습니다.', 409)
    this.name = 'DocumentVersionConflictError'
    this.currentVersion = currentVersion
  }
}

// 요청 본문 검증 오류 표현
export class DocumentBodyValidationError extends Error {
  public readonly status: 400 | 413

  constructor(
    message: string,
    status: 400 | 413 = 400,
  ) {
    super(message)
    this.name = 'DocumentBodyValidationError'
    this.status = status
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

// 응답 헤더용 파일명에서 제어 문자와 경로 문자 제거
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/\r\n"]/g, '_') || 'document.hwpx'
}

// Content-Disposition filename의 ASCII fallback 생성
function asciiFallbackFileName(fileName: string): string {
  return fileName.replace(/[^\x20-\x7e]/g, '_') || 'document.hwpx'
}

// RFC 5987 filename* UTF-8 값 인코딩
function encodeRfc5987Value(fileName: string): string {
  return encodeURIComponent(fileName).replace(/['()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

// private HWPX download 응답 헤더 생성
export function createDocumentDownloadHeaders(
  input: DocumentDownloadHeadersInput,
): Headers {
  const fileName = sanitizeFileName(input.fileName)
  const fallbackFileName = asciiFallbackFileName(fileName)

  return new Headers({
    'Content-Type': input.contentType,
    'Content-Length': String(input.byteLength),
    'Content-Disposition': `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeRfc5987Value(fileName)}`,
    ETag: `"${input.version}"`,
    'X-Document-Version': String(input.version),
    'X-Document-File-Name': encodeURIComponent(fileName),
    'Cache-Control': 'private, no-store',
  })
}

// Content-Length의 canonical 형식과 상한을 본문 읽기 전에 검사
export function assertContentLengthWithinLimit(
  contentLength: string | null,
  maxBytes: number,
): void {
  if (contentLength === null) return

  if (!CANONICAL_DOCUMENT_VERSION.test(contentLength)) {
    throw new DocumentBodyValidationError('Content-Length 헤더가 유효하지 않습니다.')
  }

  const byteLength = Number(contentLength)

  if (!Number.isSafeInteger(byteLength)) {
    throw new DocumentBodyValidationError('Content-Length 헤더가 유효하지 않습니다.')
  }

  if (byteLength > maxBytes) {
    throw new DocumentBodyValidationError(
      'HWPX 파일 크기가 허용 범위를 벗어났습니다.',
      413,
    )
  }

  if (byteLength === 0) {
    throw new DocumentBodyValidationError('HWPX 요청 본문이 비어 있습니다.')
  }
}

// 최대 크기까지 request body stream을 읽고 초과 시 즉시 취소
export async function readBodyWithinLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body) {
    throw new DocumentBodyValidationError('HWPX 요청 본문이 없습니다.')
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const nextByteLength = byteLength + value.byteLength

      if (nextByteLength > maxBytes) {
        try {
          await reader.cancel('HWPX 파일 크기 제한 초과')
        } catch {
          // cancel 실패는 413 응답을 바꾸지 않는다.
        }

        throw new DocumentBodyValidationError(
          'HWPX 파일 크기가 허용 범위를 벗어났습니다.',
          413,
        )
      }

      chunks.push(value)
      byteLength = nextByteLength
    }
  } finally {
    reader.releaseLock()
  }

  if (byteLength === 0) {
    throw new DocumentBodyValidationError('HWPX 요청 본문이 비어 있습니다.')
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
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
    body: input.bytes.slice().buffer,
  })

  if (response.status === 409) {
    const body = (await response.json()) as { currentVersion?: DocumentVersion }

    throw new DocumentVersionConflictError(body.currentVersion)
  }

  if (!response.ok) {
    throw new DocumentApiError(await readErrorMessage(response), response.status)
  }

  const body = (await response.json()) as { version?: number }

  return { version: parseDocumentVersion(String(body.version ?? '')) }
}
