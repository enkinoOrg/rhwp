import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  CreateVersionResult,
  DocumentStorage,
  StoredDocument,
  StoredObject,
} from './document-repository'

const DEFAULT_DOCUMENT_BUCKET = 'documents'

interface SupabaseDocumentStorageOptions {
  bucketName?: string
}

interface VersionCommitRow {
  kind: 'saved' | 'conflict'
  version?: number
  current_version?: number
}

// 서버 전용 Supabase private Storage와 문서 metadata adapter
export class SupabaseDocumentStorage implements DocumentStorage {
  private readonly client: SupabaseClient
  private readonly bucketName: string

  constructor(options: SupabaseDocumentStorageOptions = {}) {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('서버 Supabase 환경 변수가 설정되지 않았습니다.')
    }

    this.bucketName = options.bucketName ?? DEFAULT_DOCUMENT_BUCKET
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  // 현재 document metadata 조회
  async getDocument(documentId: string): Promise<StoredDocument | null> {
    const { data, error } = await this.client
      .from('documents')
      .select('id, file_name, current_version, current_storage_path')
      .eq('id', documentId)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      id: data.id,
      fileName: data.file_name,
      version: data.current_version,
      storagePath: data.current_storage_path,
    }
  }

  // private bucket 원본 다운로드
  async getObject(storagePath: string): Promise<StoredObject> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(storagePath)

    if (error) throw error

    return {
      bytes: new Uint8Array(await data.arrayBuffer()),
      contentType: 'application/haansofthwpx',
    }
  }

  // 기존 key 덮어쓰기를 금지한 새 object 업로드
  async putObject(input: {
    storagePath: string
    bytes: Uint8Array
    contentType: string
  }): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .upload(input.storagePath, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      })

    if (error) throw error
  }

  // 경쟁 저장 실패 시 새로 만든 미참조 object 삭제
  async deleteObject(storagePath: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucketName).remove([storagePath])

    if (error) throw error
  }

  // RPC로 version insert와 current version 갱신을 하나의 트랜잭션으로 실행
  async commitNewVersion(input: {
    documentId: string
    expectedVersion: number
    nextVersion: number
    storagePath: string
    byteSize: number
    actorId: string
  }): Promise<CreateVersionResult> {
    const { data, error } = await this.client.rpc('create_document_version', {
      p_document_id: input.documentId,
      p_expected_version: input.expectedVersion,
      p_next_version: input.nextVersion,
      p_storage_path: input.storagePath,
      p_byte_size: input.byteSize,
      p_actor_id: input.actorId,
    })

    if (error) throw error

    const row = (data as VersionCommitRow[])[0]

    if (!row) throw new Error('문서 version 저장 결과가 없습니다.')

    if (row.kind === 'conflict') {
      if (typeof row.current_version !== 'number') {
        throw new Error('충돌 응답에 현재 version이 없습니다.')
      }

      return { kind: 'conflict', currentVersion: row.current_version }
    }

    if (typeof row.version !== 'number') {
      throw new Error('저장 응답에 새 version이 없습니다.')
    }

    return { kind: 'saved', version: row.version }
  }
}
