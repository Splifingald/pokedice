import { writeFileSync } from 'node:fs'
import { EVENTS_ON } from '../../e2e/helpers'
writeFileSync(process.argv[2]!, JSON.stringify(EVENTS_ON))
