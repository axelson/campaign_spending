import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(import.meta.dirname, 'src')

// fw (fast-worktree) writes each worktree's port to .env.worktree. Read it here
// so `fw start` and a bare `npm run dev` use the same port; without the file,
// Vite's defaults apply.
function readWorktreeEnv() {
  const path = resolve(import.meta.dirname, '.env.worktree')
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.match(/^\s*([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  )
}

function worktreeServer(env) {
  if (!env.VITE_PORT) return {}
  const server = { port: Number(env.VITE_PORT), strictPort: true }
  // Behind fw's Caddy proxy (https://<worktree>.<domain>)
  if (env.FW_EXTERNAL_HOSTNAME) {
    server.allowedHosts = [env.FW_EXTERNAL_HOSTNAME]
    server.hmr = {
      host: env.FW_EXTERNAL_HOSTNAME,
      protocol: 'wss',
      clientPort: Number(env.FW_EXTERNAL_PORT),
    }
  }
  return server
}

export default defineConfig({
  root,
  // Relative asset URLs, so the build works at a domain root
  // (viz.hawaiicampaignspending.com) and under a path (axelson.github.io/campaign_spending/)
  base: './',
  server: worktreeServer(readWorktreeEnv()),
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
