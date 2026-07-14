import type {
  DocumentStorage,
  GarbageCollectionCandidate,
} from './document-repository'

type GarbageCollectionStorage = Pick<
  DocumentStorage,
  'deleteObject' | 'markOrphanObjectResolved' | 'resolveVersionCommit'
>

export type GarbageCollectionResult = 'deleted' | 'referenced' | 'retained'

// DB 참조 재확인 후에만 Storage object를 삭제하는 GC 함수
export async function collectDocumentStorageGarbage(
  storage: GarbageCollectionStorage,
  reference: GarbageCollectionCandidate,
  now: () => Date = () => new Date(),
): Promise<GarbageCollectionResult> {
  const notBefore = new Date(reference.notBefore).getTime()

  if (!Number.isFinite(notBefore) || now().getTime() < notBefore) return 'retained'

  let status

  try {
    status = await storage.resolveVersionCommit(reference)
  } catch {
    return 'retained'
  }

  if (status.kind === 'unknown') return 'retained'

  if (status.kind === 'committed') {
    await storage.markOrphanObjectResolved(reference.storagePath)
    return 'referenced'
  }

  await storage.deleteObject(reference.storagePath)
  await storage.markOrphanObjectResolved(reference.storagePath)

  return 'deleted'
}
