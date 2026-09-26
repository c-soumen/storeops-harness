import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3000);

const server = createApp().listen(PORT, () => {
  console.log(`[storeops] listening on http://localhost:${PORT}`);
});

const shutdown = (signal: string): void => {
  console.log(`[storeops] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server };
