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

// If-Match quoted ETag에서 기준 version 추출
function parseExpectedVersion(headers: Headers): number {
  const value = headers.get('if-match')
  const match = value?.match(/^"(\d+)"$/)

  if (!match) throw new Error('If-Match 헤더에 quoted version이 필요합니다.')

  return Number(match[1])
}

// HWPX MIME type, 크기, ZIP signature 검사
function validateHwpx(request: NextRequest, bytes: Uint8Array): void {
  if (request.headers.get('content-type')?.split(';')[0] !== HWPX_CONTENT_TYPE) {
    throw new Error('HWPX Content-Type이 필요합니다.')
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_HWPX_BYTES) {
    throw new Error('HWPX 파일 크기가 허용 범위를 벗어났습니다.')
  }

  const isZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04

  if (!isZip) throw new Error('HWPX ZIP signature가 유효하지 않습니다.')
}

// 응답 헤더용 안전한 파일명 정리
function safeFileName(fileName: string): string {
  return fileName.replace(/[\\/\r\n"]/g, '_') || 'document.hwpx'
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

  const fileName = safeFileName(document.fileName)

  return new Response(document.bytes, {
    headers: {
      'Content-Type': document.contentType,
      'Content-Length': String(document.bytes.byteLength),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      ETag: `"${document.version}"`,
      'X-Document-Version': String(document.version),
      'X-Document-File-Name': fileName,
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
    const message = error instanceof Error ? error.message : 'HWPX 저장에 실패했습니다.'
    const status = message.includes('파일 크기') ? 413 : 400

    return Response.json({ error: message }, { status })
  }
}
