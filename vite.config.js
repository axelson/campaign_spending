import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(import.meta.dirname, 'src')

export default defineConfig({
  root,
  // Relative asset URLs, so the build works at a domain root
  // (viz.hawaiicampaignspending.com) and under a path (axelson.github.io/campaign_spending/)
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'docs'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        candidate_spending: resolve(root, 'candidate_spending.html'),
        durable_assets: resolve(root, 'durable_assets.html'),
        starter: resolve(root, 'starter.html'),
      },
    },
  },
})
