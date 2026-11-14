import { dirname } from 'node:path';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const { app, context } = await createApp();

  await context.vault.acquireDirectoryLock();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    context.vault.lock();
    await context.vault.releaseDirectoryLock();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: context.config.host, port: context.config.port });
  app.log.info(
    `蓝鲸账本正在监听 http://${context.config.host}:${context.config.port}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
