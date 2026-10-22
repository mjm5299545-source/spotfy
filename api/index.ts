import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHostedApp } from '../server/hosted.ts';

let instance: ReturnType<typeof createHostedApp> | undefined;
function getInstance() {
  instance ??= createHostedApp().catch(error => {
    instance = undefined;
    throw error;
  });
  return instance;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { app } = await getInstance();
    await new Promise<void>((resolve, reject) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      try { app(req, res); } catch (error) { reject(error); }
    });
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Serviço indisponível. Verifique a configuração de banco e armazenamento.' }));
  }
}
