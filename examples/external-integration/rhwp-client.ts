import { createEditor } from '@rhwp/editor'

export const RHWP_STUDIO_URL = 'https://rhwp.enkinokorea.workers.dev/'

export type DocumentVersion = number

const CANONICAL_DOCUMENT_VERSION = /^(0|[1-9]\d*)$/

export interface FetchDocumentResult {
  bytes: ArrayBuffer | Uint8Array
  fileName: string
  version: DocumentVersion
}

export interface SaveDocumentInput {
  bytes: Uint8Array
  version: DocumentVersion
}

export interface SaveDocumentResult {
  version: DocumentVersion
}

export interface CreateSessionOptions {
  container: HTMLElement | string
  fetchDocument: () => Promise<FetchDocumentResult>
  saveDocument: (input: SaveDocumentInput) => Promise<SaveDocumentResult>
}

export interface RhwpDocumentSession {
  save: () => Promise<SaveDocumentResult>
  destroy: () => void
}

// canonical nonnegative safe integer version 파싱
function parseDocumentVersion(value: string | number | null): DocumentVersion {
  const serialized = String(value)

  if (!CANONICAL_DOCUMENT_VERSION.test(serialized)) {
    throw new Error('서버가 유효하지 않은 문서 version을 반환했습니다.')
  }

  const version = Number(serialized)

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

// 저장 요청 version의 canonical quoted ETag 생성
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

// HWPX 원본과 현재 version 조회
export async function getHwpxDocument(url: string): Promise<FetchDocumentResult> {
  const response = await fetch(url, { credentials: 'same-origin' })

  if (!response.ok) {
    throw new Error(`HWPX 조회에 실패했습니다. (${response.status})`)
  }

  return {
    bytes: await response.arrayBuffer(),
    fileName: parseDocumentFileName(response.headers.get('X-Document-File-Name')),
    version: parseDocumentVersion(response.headers.get('X-Document-Version')),
  }
}

// HWPX 저장 API 호출 헬퍼
export async function saveHwpxDocument(
  url: string,
  input: SaveDocumentInput,
): Promise<SaveDocumentResult> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/haansofthwpx',
      'If-Match': formatIfMatch(input.version),
    },
    body: input.bytes.slice().buffer,
  })

  if (!response.ok) {
    throw new Error(`HWPX 저장에 실패했습니다. (${response.status})`)
  }

  const body = (await response.json()) as { version?: number }

  return { version: parseDocumentVersion(body.version ?? null) }
}

// RHWP 편집 세션 생성 함수
export async function createRhwpDocumentSession(
  options: CreateSessionOptions,
): Promise<RhwpDocumentSession> {
  const editor = await createEditor(options.container, {
    studioUrl: RHWP_STUDIO_URL,
    width: '100%',
    height: '100%',
  })

  let response: FetchDocumentResult

  try {
    response = await options.fetchDocument()
    await editor.loadFile(response.bytes, response.fileName)
  } catch (error) {
    editor.destroy()
    throw error
  }

  let currentVersion = response.version

  return {
    // 편집 결과 저장 함수
    async save() {
      const bytes = await editor.exportHwpx()
      const result = await options.saveDocument({ bytes, version: currentVersion })

      currentVersion = result.version

      return result
    },
    // 편집기 리소스 해제 함수
    destroy() {
      editor.destroy()
    },
  }
}
