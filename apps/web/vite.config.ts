import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Carnet',
        short_name: 'Carnet',
        description: 'Ton espace personnel pour écrire chaque jour.',
        lang: 'fr',
        theme_color: '#c98a5c',
        background_color: '#f5efe6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        // Mermaid (~3 Mo avec d3/cytoscape) est chargé à la demande : on ne le
        // précache pas (sinon dépassement de la limite 2 Mo + 3 Mo inutiles pour
        // tous les utilisateurs). Il est récupéré au 1er diagramme affiché.
        // `diary-ico.png` est la SOURCE des favicons (1254px, ~845 Ko), pas un
        // asset runtime : on ne la précache pas (les favicons générés suffisent).
        globIgnores: ['**/vendor-mermaid-*.js', 'diary-ico.png'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Découpe les vendor libs en chunks séparés pour permettre le caching long terme
    // et éviter de recharger 1.5 MB à chaque déploiement.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          // Tiptap (~400 KB) : éditeur riche, lourd. Chunk dédié.
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-tiptap';
          // Lowlight + highlight.js : coloration syntaxique des blocs de code
          if (id.includes('lowlight') || id.includes('highlight.js') || id.includes('refractor')) return 'vendor-highlight';
          // QRCode : utilisé seulement pour le 2FA
          if (id.includes('qrcode')) return 'vendor-qrcode';
          // Emoji picker (~300 KB de données) : lazy-loaded à la 1ère ouverture
          // d'un picker (reactions, humeurs…), pas dans le main bundle.
          if (id.includes('emoji-mart')) return 'vendor-emoji';
          // React + React-DOM
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'vendor-react';
          // React Router
          if (id.includes('react-router')) return 'vendor-router';
          // tRPC + TanStack Query
          if (id.includes('@tanstack') || id.includes('@trpc')) return 'vendor-trpc';
          // Dexie (IndexedDB)
          if (id.includes('dexie')) return 'vendor-dexie';
          // Markdown rendering
          if (id.includes('marked') || id.includes('dompurify') || id.includes('markdown-it')) return 'vendor-markdown';
          // Mermaid + ses grosses deps (d3, cytoscape, dagre, elk, katex…) :
          // chunk lazy dédié, chargé seulement quand un diagramme est rendu.
          // Doit rester APRÈS la règle markdown (marked/dompurify y sont partagés).
          if (
            id.includes('/mermaid') || id.includes('@mermaid-js') ||
            id.includes('d3-') || id.includes('/d3/') ||
            id.includes('cytoscape') || id.includes('dagre') || id.includes('elkjs') ||
            id.includes('katex') || id.includes('khroma') ||
            id.includes('roughjs') || id.includes('hachure-fill') ||
            id.includes('points-on-') || id.includes('path-data-parser') ||
            id.includes('delaunator') || id.includes('robust-predicates') || id.includes('internmap') ||
            id.includes('@braintree')
          ) return 'vendor-mermaid';
          // Form + validation
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/') || id.includes('superjson')) return 'vendor-utils';
          return 'vendor';
        },
      },
    },
    // Augmente le seuil d'avertissement (les vendor chunks sont attendus gros)
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5201,
    proxy: {
      '/trpc': {
        target: 'http://localhost:4101',
        changeOrigin: true,
      },
      // Streaming NDJSON (récap mensuel IA) — même besoin de flush immédiat que /events.
      '/ai': {
        target: 'http://localhost:4101',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, _req, res) => {
            (res as import('node:http').ServerResponse).socket?.setNoDelay(true);
          });
        },
      },
      '/images': {
        target: 'http://localhost:4101',
        changeOrigin: true,
      },
      '/audios': {
        target: 'http://localhost:4101',
        changeOrigin: true,
      },
      '/videos': {
        target: 'http://localhost:4101',
        changeOrigin: true,
      },
      // SSE — flux temps réel ; désactive le buffering Nagle côté proxy de dev.
      // Sans ça, http-proxy accumule les petits chunks avant d'envoyer, ce qui
      // retarde les events de plusieurs secondes.
      '/events': {
        target: 'http://localhost:4101',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, _req, res) => {
            // Désactive l'algorithme de Nagle sur le socket client → flush immédiat
            (res as import('node:http').ServerResponse).socket?.setNoDelay(true);
          });
        },
      },
    },
  },
});
