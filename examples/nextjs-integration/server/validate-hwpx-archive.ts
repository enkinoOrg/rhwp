import type { HwpxArchiveValidator } from './document-repository'

const REQUIRED_HWPX_ENTRIES = [
  'mimetype',
  'version.xml',
  'Contents/content.hpf',
  'Contents/header.xml',
  'Contents/section0.xml',
  'META-INF/manifest.xml',
] as const

const HWPX_MIMETYPE = 'application/hwp+zip'
const XML_ENTRY_EXTENSIONS = ['.xml', '.hpf', '.rdf', '.rels', '.opf'] as const

export interface InspectedZipEntry {
  path: string
  uncompressedSize: number
  readBytes(maxBytes: number): Promise<Uint8Array>
}

export interface ZipInspector {
  inspect(bytes: Uint8Array): Promise<readonly InspectedZipEntry[]>
}

export interface SecureXmlParser {
  parse(bytes: Uint8Array, sourceName: string): Promise<void>
}

export interface HwpxArchiveLimits {
  maxEntries: number
  maxEntryBytes: number
  maxTotalUncompressedBytes: number
  maxXmlBytes: number
}

const DEFAULT_LIMITS: HwpxArchiveLimits = {
  maxEntries: 256,
  maxEntryBytes: 20 * 1024 * 1024,
  maxTotalUncompressedBytes: 100 * 1024 * 1024,
  maxXmlBytes: 10 * 1024 * 1024,
}

// 외부에 공개 가능한 HWPX 구조 검증 오류
export class HwpxArchiveValidationError extends Error {
  public readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'HwpxArchiveValidationError'
  }
}

// archive entry 경로 정규화 및 traversal 차단
function normalizeEntryPath(path: string): string {
  if (
    !path ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path)
  ) {
    throw new HwpxArchiveValidationError('HWPX entry 경로가 유효하지 않습니다.')
  }

  const segments = path.split('/')

  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new HwpxArchiveValidationError('HWPX entry 경로가 유효하지 않습니다.')
  }

  return segments.join('/')
}

// XML 계열 entry 여부 확인
function isXmlEntry(path: string): boolean {
  const lowerPath = path.toLowerCase()

  return XML_ENTRY_EXTENSIONS.some(extension => lowerPath.endsWith(extension))
}

// 검증된 ZIP inspector를 HWPX 정책 validator로 조합
export function createHwpxArchiveValidator(
  inspector: ZipInspector,
  xmlParser: SecureXmlParser,
  limits: HwpxArchiveLimits = DEFAULT_LIMITS,
): HwpxArchiveValidator {
  return async bytes => {
    let entries: readonly InspectedZipEntry[]

    try {
      entries = await inspector.inspect(bytes)
    } catch {
      throw new HwpxArchiveValidationError('HWPX ZIP 구조를 읽을 수 없습니다.')
    }

    if (entries.length === 0 || entries.length > limits.maxEntries) {
      throw new HwpxArchiveValidationError('HWPX entry 수가 허용 범위를 벗어났습니다.')
    }

    const entriesByPath = new Map<string, InspectedZipEntry>()
    let totalUncompressedBytes = 0

    for (const entry of entries) {
      const path = normalizeEntryPath(entry.path)

      if (entriesByPath.has(path)) {
        throw new HwpxArchiveValidationError('HWPX에 중복 entry가 있습니다.')
      }

      if (
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize < 0 ||
        entry.uncompressedSize > limits.maxEntryBytes
      ) {
        throw new HwpxArchiveValidationError('HWPX entry 크기가 허용 범위를 벗어났습니다.')
      }

      if (isXmlEntry(path) && entry.uncompressedSize > limits.maxXmlBytes) {
        throw new HwpxArchiveValidationError('HWPX XML 크기가 허용 범위를 벗어났습니다.')
      }

      totalUncompressedBytes += entry.uncompressedSize

      if (
        !Number.isSafeInteger(totalUncompressedBytes) ||
        totalUncompressedBytes > limits.maxTotalUncompressedBytes
      ) {
        throw new HwpxArchiveValidationError('HWPX 압축 해제 크기가 허용 범위를 벗어났습니다.')
      }

      entriesByPath.set(path, entry)
    }

    for (const path of REQUIRED_HWPX_ENTRIES) {
      if (!entriesByPath.has(path)) {
        throw new HwpxArchiveValidationError(`HWPX 필수 entry가 없습니다: ${path}`)
      }
    }

    const mimetypeEntry = entriesByPath.get('mimetype')

    if (!mimetypeEntry) {
      throw new HwpxArchiveValidationError('HWPX mimetype entry가 없습니다.')
    }

    let mimetypeBytes: Uint8Array

    try {
      mimetypeBytes = await mimetypeEntry.readBytes(limits.maxEntryBytes)
    } catch {
      throw new HwpxArchiveValidationError('HWPX mimetype을 읽을 수 없습니다.')
    }

    if (mimetypeBytes.byteLength > limits.maxEntryBytes) {
      throw new HwpxArchiveValidationError('HWPX mimetype 크기가 허용 범위를 벗어났습니다.')
    }

    let mimetype: string

    try {
      mimetype = new TextDecoder('utf-8', { fatal: true }).decode(mimetypeBytes)
    } catch {
      throw new HwpxArchiveValidationError('HWPX mimetype 인코딩이 유효하지 않습니다.')
    }

    if (mimetype !== HWPX_MIMETYPE) {
      throw new HwpxArchiveValidationError('HWPX mimetype이 유효하지 않습니다.')
    }

    for (const [path, entry] of entriesByPath) {
      if (path === 'mimetype' || !isXmlEntry(path)) continue

      let xmlBytes: Uint8Array

      try {
        xmlBytes = await entry.readBytes(limits.maxXmlBytes)
      } catch {
        throw new HwpxArchiveValidationError(`HWPX XML을 읽을 수 없습니다: ${path}`)
      }

      if (xmlBytes.byteLength > limits.maxXmlBytes) {
        throw new HwpxArchiveValidationError(`HWPX XML 크기가 허용 범위를 벗어났습니다: ${path}`)
      }

      try {
        await xmlParser.parse(xmlBytes, path)
      } catch {
        throw new HwpxArchiveValidationError(`HWPX XML이 유효하지 않습니다: ${path}`)
      }
    }
  }
}
