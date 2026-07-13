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

export interface DocumentStorage {
  getDocument(documentId: string): Promise<StoredDocument | null>
  getObject(storagePath: string): Promise<StoredObject>
  putObject(input: {
    storagePath: string
    bytes: Uint8Array
    contentType: string
  }): Promise<void>
  deleteObject(storagePath: string): Promise<void>
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
  constructor(private readonly storage: DocumentStorage) {}

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

    const nextVersion = document.version + 1
    const storagePath = this.createStoragePath(input.documentId, nextVersion)

    // 새 key에만 쓰므로 현재 원본을 덮어쓰지 않는다.
    await this.storage.putObject({
      storagePath,
      bytes: input.bytes,
      contentType: 'application/haansofthwpx',
    })

    const result = await this.storage.commitNewVersion({
      documentId: input.documentId,
      expectedVersion: input.expectedVersion,
      nextVersion,
      storagePath,
      byteSize: input.bytes.byteLength,
      actorId: input.actorId,
    })

    if (result.kind === 'conflict') {
      // 경쟁 저장에서 남은 미참조 object만 정리한다.
      await this.storage.deleteObject(storagePath)
    }

    return result
  }

  // 재사용을 막는 version object key 생성
  private createStoragePath(documentId: string, version: DocumentVersion): string {
    return `${documentId}/versions/${version}-${crypto.randomUUID()}.hwpx`
  }
}
