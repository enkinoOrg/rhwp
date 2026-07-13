import { NextRequest } from 'next/server'

import { DocumentRepository } from '../../../../../server/document-repository'
import { SupabaseDocumentStorage } from '../../../../../server/supabase-document-storage'
import {
  assertCanEditDocument,
  assertCanReadDocument,
  requireSession,
} from '@/server/auth/document-access'

const HWPX_CONTENT_TYPE = 'application/haansofthwpx'
export const MAX_HWPX_BYTES = 50 * 1024 * 1024

const repository = new DocumentRepository(new SupabaseDocumentStorage())

interface RouteContext {
  params: Promise<{ documentId: string }>
}

// 클라이언트에 공개해도 되는 입력 검증 오류
class RequestValidationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 = 400,
  ) {
    super(message)
    this.name = 'RequestValidationError'
  }
}

// If-Match quoted ETag에서 기준 version 추출
function parseExpectedVersion(headers: Headers): number {
  const value = headers.get('if-match')
  const match = value?.match(/^"(0|[1-9]\d*)"$/)

  if (!match) {
    throw new RequestValidationError('If-Match 헤더에 canonical quoted version이 필요합니다.')
  }

  const version = Number(match[1])

  if (!Number.isSafeInteger(version) || version < 0) {
    throw new RequestValidationError('If-Match version이 유효하지 않습니다.')
  }

  return version
}

// HWPX MIME type, 크기, ZIP signature 검사
function validateHwpx(request: NextRequest, bytes: Uint8Array): void {
  if (request.headers.get('content-type')?.split(';')[0] !== HWPX_CONTENT_TYPE) {
    throw new RequestValidationError('HWPX Content-Type이 필요합니다.')
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_HWPX_BYTES) {
    throw new RequestValidationError('HWPX 파일 크기가 허용 범위를 벗어났습니다.', 413)
  }

  const isZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04

  if (!isZip) throw new RequestValidationError('HWPX ZIP signature가 유효하지 않습니다.')
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

// 문서 원본을 private Storage에서 읽어 반환
export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  const session = await requireSession()
  const documentId = (await context.params).documentId

  await assertCanReadDocument(session.userId, documentId)

  const document = await repository.getCurrentFile(documentId)

  if (!document) {
    return Response.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  const fileName = sanitizeFileName(document.fileName)
  const fallbackFileName = asciiFallbackFileName(fileName)

  return new Response(document.bytes, {
    headers: {
      'Content-Type': document.contentType,
      'Content-Length': String(document.bytes.byteLength),
      'Content-Disposition': `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeRfc5987Value(fileName)}`,
      ETag: `"${document.version}"`,
      'X-Document-Version': String(document.version),
      'X-Document-File-Name': encodeURIComponent(fileName),
      'Cache-Control': 'private, no-store',
    },
  })
}

// 기준 version이 일치할 때만 새 HWPX version 저장
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const session = await requireSession()
  const documentId = (await context.params).documentId

  await assertCanEditDocument(session.userId, documentId)

  try {
    const expectedVersion = parseExpectedVersion(request.headers)
    const bytes = new Uint8Array(await request.arrayBuffer())

    validateHwpx(request, bytes)

    const result = await repository.createVersion({
      documentId,
      expectedVersion,
      bytes,
      actorId: session.userId,
    })

    if (result.kind === 'conflict') {
      return Response.json(result, { status: 409 })
    }

    return Response.json({ version: result.version }, { status: 200 })
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return Response.json({ error: error.message }, { status: error.status })
    }

    console.error('HWPX 저장 중 서버 오류', { documentId, error })

    return Response.json(
      { error: 'HWPX 저장 중 서버 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
