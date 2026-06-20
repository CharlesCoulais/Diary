import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { router, ownerProcedure } from '../trpc.js';
import { db } from '../db.js';
import { isR2Configured, r2Delete } from '../lib/r2.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'videos');

export const videosRouter = router({
  delete: ownerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await db.video.findFirst({
        where: { id: input.id, authorId: ctx.user.id },
        select: { filePath: true },
      });
      if (!video) return { ok: true };

      await db.video.deleteMany({ where: { id: input.id, authorId: ctx.user.id } });

      if (video.filePath) {
        if (isR2Configured()) {
          await r2Delete(video.filePath);
        } else {
          const filename = path.basename(video.filePath);
          fs.rmSync(path.join(UPLOADS_DIR, filename), { force: true });
        }
      }

      return { ok: true };
    }),
});
