import type { SecureXmlParser } from './validate-hwpx-archive'

interface XmlValidationError {
  err: { msg: string }
}

interface SecureXmlParserDependencies {
  validate(xml: string): true | XmlValidationError
  parse(xml: string): unknown
}

const FORBIDDEN_XML_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i

// 검증된 XML library의 validator와 parser를 보안 정책으로 조합
export function createSecureXmlParser(
  dependencies: SecureXmlParserDependencies,
): SecureXmlParser {
  return {
    async parse(bytes: Uint8Array): Promise<void> {
      const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)

      if (FORBIDDEN_XML_DECLARATION.test(xml)) {
        throw new Error('DOCTYPE과 ENTITY 선언은 허용되지 않습니다.')
      }

      const validation = dependencies.validate(xml)

      if (validation !== true) {
        throw new Error(`XML 문법이 유효하지 않습니다: ${validation.err.msg}`)
      }

      dependencies.parse(xml)
    },
  }
}
