import { writeFileSync } from 'node:fs'
import { EVENTS_ON } from '/home/user/pokedice/e2e/helpers'
writeFileSync(process.argv[2]!, JSON.stringify(EVENTS_ON))
