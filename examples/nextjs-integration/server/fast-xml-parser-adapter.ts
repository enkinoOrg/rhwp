import { XMLParser, XMLValidator } from 'fast-xml-parser'

import { createSecureXmlParser } from './secure-xml-parser'

const parser = new XMLParser({ processEntities: false })

// fast-xml-parser의 validation과 parsing을 사용하는 production wiring
export const secureXmlParser = createSecureXmlParser({
  validate: xml => XMLValidator.validate(xml),
  parse: xml => parser.parse(xml),
})
