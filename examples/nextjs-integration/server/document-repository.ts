export type DocumentVersion = number

export interface StoredDocument {
  id: string
  fileName: string
  version: DocumentVersion
  storagePath: string
}

export interface StoredObject {
  bytes: Uint8Array
  contentType: string
}

export interface CreateVersionInput {
  documentId: string
  expectedVersion: DocumentVersion
  bytes: Uint8Array
  actorId: string
}

export type CreateVersionResult =
  | { kind: 'saved'; version: DocumentVersion }
  | { kind: 'conflict'; currentVersion: DocumentVersion }

export type HwpxArchiveValidator = (bytes: Uint8Array) => Promise<void>

export interface VersionCommitReference {
  documentId: string
  version: DocumentVersion
  storagePath: string
}

export type VersionCommitStatus =
  | { kind: 'committed'; version: DocumentVersion }
  | { kind: 'not-committed' }
  | { kind: 'unknown' }

export interface OrphanObjectRecord extends VersionCommitReference {
  reason: 'version-conflict' | 'commit-not-committed' | 'commit-unknown'
  lastError: string
}

export interface DocumentStorage {
  getDocument(documentId: string): Promise<StoredDocument | null>
  getObject(storagePath: string): Promise<StoredObject>
  putObject(input: {
    storagePath: string
    bytes: Uint8Array
    contentType: string
  }): Promise<void>
  deleteObject(storagePath: string): Promise<void>
  resolveVersionCommit(input: VersionCommitReference): Promise<VersionCommitStatus>
  recordOrphanObject(input: OrphanObjectRecord): Promise<void>
  markOrphanObjectResolved(storagePath: string): Promise<void>
  commitNewVersion(input: {
    documentId: string
    expectedVersion: DocumentVersion
    nextVersion: DocumentVersion
    storagePath: string
    byteSize: number
    actorId: string
  }): Promise<CreateVersionResult>
}

export interface DocumentFile extends StoredObject {
  fileName: string
  version: DocumentVersion
}

// 문서 metadata와 private Storage를 조합하는 저장소
export class DocumentRepository {
  private readonly storage: DocumentStorage
  private readonly validateHwpxArchive: HwpxArchiveValidator

  constructor(storage: DocumentStorage, validateHwpxArchive: HwpxArchiveValidator) {
    this.storage = storage
    this.validateHwpxArchive = validateHwpxArchive
  }

  // 현재 HWPX 원본 조회
  async getCurrentFile(documentId: string): Promise<DocumentFile | null> {
    const document = await this.storage.getDocument(documentId)

    if (!document) return null

    const object = await this.storage.getObject(document.storagePath)

    return { ...object, fileName: document.fileName, version: document.version }
  }

  // 새 object와 append-only version을 생성하는 저장
  async createVersion(input: CreateVersionInput): Promise<CreateVersionResult> {
    const document = await this.storage.getDocument(input.documentId)

    if (!document) throw new Error('문서를 찾을 수 없습니다.')

    if (document.version !== input.expectedVersion) {
      return { kind: 'conflict', currentVersion: document.version }
    }

    await this.validateHwpxArchive(input.bytes)

    const nextVersion = document.version + 1
    const storagePath = this.createStoragePath(input.documentId, nextVersion)

    // 새 key에만 쓰므로 현재 원본을 덮어쓰지 않는다.
    await this.storage.putObject({
      storagePath,
      bytes: input.bytes,
      contentType: 'application/haansofthwpx',
    })

    let result: CreateVersionResult

    try {
      result = await this.storage.commitNewVersion({
        documentId: input.documentId,
        expectedVersion: input.expectedVersion,
        nextVersion,
        storagePath,
        byteSize: input.bytes.byteLength,
        actorId: input.actorId,
      })
    } catch (commitError) {
      return this.resolveUnknownCommit(
        {
          documentId: input.documentId,
          version: nextVersion,
          storagePath,
        },
        commitError,
      )
    }

    if (result.kind === 'conflict') {
      // 경쟁 저장에서 남은 미참조 object만 정리한다.
      await this.cleanupOrphanObject(
        { documentId: input.documentId, version: nextVersion, storagePath },
        'version-conflict',
      )
    }

    return result
  }

  // 재사용을 막는 version object key 생성
  private createStoragePath(documentId: string, version: DocumentVersion): string {
    return `${documentId}/versions/${version}-${crypto.randomUUID()}.hwpx`
  }

  // 실패해도 version 충돌 응답을 유지하는 고아 object 정리
  private async cleanupOrphanObject(
    reference: VersionCommitReference,
    reason: OrphanObjectRecord['reason'],
  ): Promise<void> {
    try {
      await this.storage.deleteObject(reference.storagePath)
    } catch (cleanupError) {
      await this.recordOrphanObject(reference, reason, cleanupError)
    }
  }

  // 응답 유실 가능성이 있는 commit 결과 복구
  private async resolveUnknownCommit(
    reference: VersionCommitReference,
    commitError: unknown,
  ): Promise<CreateVersionResult> {
    let status: VersionCommitStatus

    try {
      status = await this.storage.resolveVersionCommit(reference)
    } catch (probeError) {
      await this.recordOrphanObject(reference, 'commit-unknown', probeError)
      throw commitError
    }

    if (status.kind === 'committed') {
      if (status.version === reference.version) {
        return { kind: 'saved', version: status.version }
      }

      await this.recordOrphanObject(reference, 'commit-unknown', commitError)
      throw commitError
    }

    if (status.kind === 'not-committed') {
      await this.cleanupOrphanObject(reference, 'commit-not-committed')
      throw commitError
    }

    await this.recordOrphanObject(reference, 'commit-unknown', commitError)
    throw commitError
  }

  // 후속 GC를 위한 durable queue 기록
  private async recordOrphanObject(
    reference: VersionCommitReference,
    reason: OrphanObjectRecord['reason'],
    error: unknown,
  ): Promise<void> {
    try {
      await this.storage.recordOrphanObject({
        ...reference,
        reason,
        lastError: String(error),
      })
    } catch (recordError) {
      console.error('고아 HWPX object durable GC 기록 실패', {
        storagePath: reference.storagePath,
        error,
        recordError,
      })
    }
  }
}
