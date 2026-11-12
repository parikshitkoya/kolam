// Hono port of @devvit/analytics/server/reddit's Express createTelemetryRouter (0.15.3 router.js):
// same five routes, same validation and response shapes. Mounted at /api/telemetry.
import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import { TELEMETRY_UNSPECIFIED_RECEIPT } from '@devvit/analytics/shared/reddit';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const invalidReceipt = {
  status: 'JOURNEY_RECEIPT_INVALID',
  message: 'Invalid: Event payload was not recorded.',
} as const;

type Parsed<T> = { value: T } | { error: string };

type ProgressReq = { journeyId: string; progress: number; action?: string; actionDetails?: string };
type InteractionReq = { journeyId: string; action: string; actionDetails: string };
type EndReq = { journeyId: string; complete: boolean; game?: { win: boolean; score: number } };

const toProgress = (b: unknown): Parsed<ProgressReq> => {
  if (!isRecord(b)) return { error: 'Expected a JSON object body.' };
  const { journeyId, progress, action, actionDetails } = b;
  if (!isNonEmptyString(journeyId)) return { error: 'journeyId is required.' };
  if (!isNumber(progress)) return { error: 'progress must be a number between 0 and 1.' };
  if (progress < 0 || progress > 1) return { error: 'progress must be between 0 and 1.' };
  if (action !== undefined && !isNonEmptyString(action)) return { error: 'action must be a non-empty string.' };
  if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
    return { error: 'actionDetails must be a non-empty string.' };
  }
  return {
    value: {
      journeyId,
      progress,
      ...(action !== undefined ? { action } : {}),
      ...(actionDetails !== undefined ? { actionDetails } : {}),
    },
  };
};

const toInteraction = (b: unknown): Parsed<InteractionReq> => {
  if (!isRecord(b)) return { error: 'Expected a JSON object body.' };
  const { journeyId, action, actionDetails } = b;
  if (journeyId !== undefined && typeof journeyId !== 'string') return { error: 'journeyId must be a string.' };
  if (!isNonEmptyString(action)) return { error: 'action is required.' };
  if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
    return { error: 'actionDetails must be a non-empty string.' };
  }
  return {
    value: {
      journeyId: isNonEmptyString(journeyId) ? journeyId : '',
      action,
      actionDetails: isNonEmptyString(actionDetails) ? actionDetails : '',
    },
  };
};

const toEnd = (b: unknown): Parsed<EndReq> => {
  if (!isRecord(b)) return { error: 'Expected a JSON object body.' };
  const { journeyId, complete, game } = b;
  if (!isNonEmptyString(journeyId)) return { error: 'journeyId is required.' };
  if (complete !== undefined && typeof complete !== 'boolean') return { error: 'complete must be a boolean.' };
  const done = typeof complete === 'boolean' ? complete : false;
  if (game === undefined) return { value: { journeyId, complete: done } };
  if (!isRecord(game)) return { error: 'game must be an object.' };
  if (game.win !== undefined && typeof game.win !== 'boolean') return { error: 'game.win must be a boolean.' };
  if (game.score !== undefined && !isNumber(game.score)) return { error: 'game.score must be a number.' };
  return {
    value: {
      journeyId,
      complete: done,
      game: {
        win: typeof game.win === 'boolean' ? game.win : false,
        score: typeof game.score === 'number' ? game.score : 0,
      },
    },
  };
};

const readBody = async (req: { json: () => Promise<unknown> }): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
};

const bad = (error: string) => {
  console.warn('Telemetry router bad request:', error);
  return { error, receipt: invalidReceipt };
};

export const telemetryRoutes = new Hono();

telemetryRoutes.onError((err, c) => {
  console.error('Telemetry router error:', err);
  return c.json({ error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT }, 500);
});

telemetryRoutes.post('/journey/start', async (c) => {
  const r = await telemetry.startJourney();
  if (!isNonEmptyString(r.journeyId)) throw new Error('Telemetry journey id missing');
  return c.json(r, 200);
});

telemetryRoutes.post('/journey/progress', async (c) => {
  const p = toProgress(await readBody(c.req));
  if ('error' in p) return c.json(bad(p.error), 400);
  return c.json(await telemetry.journeyProgress(p.value), 200);
});

telemetryRoutes.post('/journey/interaction', async (c) => {
  const p = toInteraction(await readBody(c.req));
  if ('error' in p) return c.json(bad(p.error), 400);
  return c.json(await telemetry.journeyInteraction(p.value), 200);
});

telemetryRoutes.post('/journey/end', async (c) => {
  const p = toEnd(await readBody(c.req));
  if ('error' in p) return c.json(bad(p.error), 400);
  return c.json(await telemetry.endJourney(p.value), 200);
});

telemetryRoutes.post('/journey/app-ready', async (c) => c.json(await telemetry.appReady(), 200));
