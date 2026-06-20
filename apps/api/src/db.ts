import { PrismaClient } from '@prisma/client';
import { isDev } from './env.js';

export const db = new PrismaClient({
  log: isDev ? ['warn', 'error'] : ['error'],
});
