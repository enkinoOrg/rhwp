import { createEditor } from '@rhwp/editor'

export const RHWP_STUDIO_URL = 'https://rhwp.enkinokorea.workers.dev/'

export type DocumentVersion = number | string

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

// HWPX 저장 API 호출 헬퍼
export async function saveHwpxDocument(
  url: string,
  input: SaveDocumentInput,
): Promise<SaveDocumentResult> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/haansofthwpx',
      'If-Match': `"${String(input.version)}"`,
    },
    body: input.bytes,
  })

  if (!response.ok) {
    throw new Error(`HWPX 저장에 실패했습니다. (${response.status})`)
  }

  return (await response.json()) as SaveDocumentResult
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
