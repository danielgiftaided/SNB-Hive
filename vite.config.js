import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { randomUUID } from 'node:crypto'

const buildVersion = randomUUID()

export default defineConfig({
  define: { __SNB_BUILD_VERSION__: JSON.stringify(buildVersion) },
  plugins: [react(), {
    name: 'snb-build-version',
    generateBundle() {
      this.emitFile({ type:'asset', fileName:'app-version.json', source:JSON.stringify({ version:buildVersion }) + '\n' })
    },
  }],
})
