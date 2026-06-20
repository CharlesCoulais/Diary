/// <reference types="vite/client" />

/**
 * Timestamp ISO du build du bundle JS courant, injecté par Vite à la
 * compilation (cf. `define` dans vite.config.ts). Permet à l'utilisateur
 * de voir si son bundle local (PWA cachée) est à jour ou non — séparé de
 * la version de l'API qui peut être plus récente.
 */
declare const __BUILD_TIME__: string;
