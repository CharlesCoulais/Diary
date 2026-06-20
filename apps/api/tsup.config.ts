import { defineConfig } from 'tsup';

// Identifiant unique du build, gelé dans le bundle. Stable entre toutes les
// replicas démarrées à partir du même artefact, différent à chaque `tsup`
// (donc à chaque `railway up` qui rebuild). Permet au client de détecter
// fiablement un nouveau déploiement, même si Railway n'injecte pas
// RAILWAY_DEPLOYMENT_ID (cas `railway up` depuis le local).
const BUILD_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  outDir: 'dist',
  splitting: false,
  sourcemap: false,
  clean: true,
  // Garde les dépendances natives et Prisma hors du bundle
  external: ['argon2', '@prisma/client', 'fsevents'],
  noExternal: ['@carnet/schemas'],
  define: {
    'process.env.BUILD_ID': JSON.stringify(BUILD_ID),
  },
});
