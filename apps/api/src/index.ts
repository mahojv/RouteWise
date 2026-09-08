import { buildServer } from './server';
import { env } from './config/env';

async function start() {
  const server = await buildServer();

  try {
    const address = await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    server.log.info(`🚀 RouteWise API server listening on ${address}`);
    server.log.info(`🩺 Health check endpoint: http://${env.HOST}:${env.PORT}/health`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
