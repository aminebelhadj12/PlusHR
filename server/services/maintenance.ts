import type { Request, RequestHandler, Response } from 'express';

const requests = new Set<Response>();
const handlers = new Set<Response>();
let maintenance = false;

export function isInMaintenance(): boolean {
  return maintenance;
}

export const trackApiRequests: RequestHandler = (_req, res, next) => {
  if (maintenance) {
    res.set('Retry-After', '30').status(503).json({ error: 'Restauration en cours. Réessayez dans quelques instants.' });
    return;
  }

  requests.add(res);
  const done = () => { requests.delete(res); };
  res.once('finish', done);
  res.once('close', done);
  next();
};

export function trackApiHandler(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    if (res.destroyed) return;
    handlers.add(res);
    void Promise.resolve().then(() => handler(req, res)).catch(next).finally(() => {
      handlers.delete(res);
    });
  };
}

export async function drainApiRequests(restoreResponse: Response): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while ([...requests, ...handlers].some((response) => response !== restoreResponse)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

export function setMaintenance(active: boolean): void {
  maintenance = active;
}
