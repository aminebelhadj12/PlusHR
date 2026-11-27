import crypto from 'node:crypto';
import type { Response } from 'express';
import { getSqliteDb } from '../config/database.js';
import { matchesSession, type AuthenticatedRequest, type JwtPayload } from '../middlewares/auth.js';
import { loadDb, mutateAuthDb, newId, type DbSchema, type DbUser } from '../repositories/dataStore.js';
import { askHrAssistant } from '../services/geminiService.js';
import { sanitizeText } from '../validators/validators.js';

type Conversation = DbSchema['ai_conversations'][number];
type Access = { identity: JwtPayload; scope: string; department: string | null };
const roles = new Set(['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE']);
const pendingConversations = new Set<string>();
const notFound = { error: 'Conversation introuvable.' };
const archivedError = { error: 'Ce périmètre de conversation ne peut plus être vérifié. Ouvrez une nouvelle conversation.' };

function getAccess(req: AuthenticatedRequest): Access | null {
  const identity = req.user!;
  const sqlite = getSqliteDb();
  const user = sqlite.prepare(`
    SELECT id, company_id, role_code, password_hash FROM users
    WHERE id = ? AND is_active = 1 AND must_change_password = 0
      AND (company_id IS NULL OR EXISTS (
        SELECT 1 FROM companies WHERE id = users.company_id AND status <> 'suspended'
      ))
  `).get(identity.userId) as Pick<DbUser, 'id' | 'company_id' | 'role_code' | 'password_hash'> | undefined;
  if (!user || !roles.has(user.role_code) || !matchesSession(identity, user) || (identity.exp && identity.exp * 1000 <= Date.now())) return null;
  if ((user.role_code === 'SUPER_ADMIN') !== (user.company_id === null)) return null;
  const department = user.role_code === 'MANAGER' ? sqlite.prepare(`
    SELECT d.id FROM employees e JOIN departments d ON d.id = e.department_id AND d.company_id = e.company_id
    WHERE e.user_id = ? AND e.company_id = ? AND e.status <> 'archived' AND d.is_archived = 0
  `).pluck().get(user.id, user.company_id) as string | undefined : null;
  if (user.role_code === 'MANAGER' && !department) return null;
  const scope = crypto.createHash('sha256')
    .update(JSON.stringify([user.id, user.company_id, user.role_code, department])).digest('hex').slice(0, 16);
  return { identity, scope, department: department ?? null };
}

function owns(conversation: Conversation, access: Access): boolean {
  return conversation.user_id === access.identity.userId && conversation.company_id === access.identity.companyId;
}

// Earlier records contain no permission provenance and could contain replies appended from another account.
function isArchived(conversation: Conversation, access: Access): boolean {
  return !conversation.id.startsWith(`aiconv-${access.scope}-`);
}

function ownedById(db: DbSchema, id: string, access: Access) {
  return db.ai_conversations.find((item) => item.id === id && owns(item, access));
}

function messagesFor(db: DbSchema, conversation: Conversation, access: Access) {
  return isArchived(conversation, access) ? [] : db.ai_messages.filter((item) => item.ai_conversation_id === conversation.id);
}

function requireAccess(req: AuthenticatedRequest, res: Response) {
  res.set('Cache-Control', 'no-store');
  const access = getAccess(req);
  if (!access) res.status(403).json({ error: 'Accès à l’assistant non autorisé.' });
  return access;
}

export function listAiConversations(req: AuthenticatedRequest, res: Response): void {
  const access = requireAccess(req, res);
  if (!access) return;
  const db = loadDb();
  const query = sanitizeText(req.query.q, 100).toLowerCase();
  const summary = req.query.summary === '1';
  const conversations = db.ai_conversations.filter((item) => owns(item, access))
    .flatMap((item) => {
      const messages = messagesFor(db, item, access);
      if (query && !item.title.toLowerCase().includes(query) &&
          !messages.some((message) => message.content.toLowerCase().includes(query))) return [];
      const updatedAt = messages.at(-1)?.created_at || item.created_at;
      return [{ ...item, updatedAt, archived: isArchived(item, access), ...(summary ? {} : { messages }) }];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ conversations });
}

export function getAiConversation(req: AuthenticatedRequest, res: Response): void {
  const access = requireAccess(req, res);
  if (!access) return;
  const db = loadDb();
  const item = ownedById(db, req.params.id, access);
  if (!item) {
    res.status(404).json(notFound);
    return;
  }
  res.json({ conversation: { ...item, archived: isArchived(item, access), messages: messagesFor(db, item, access) } });
}

export async function renameAiConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const access = requireAccess(req, res);
  if (!access) return;
  const raw = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const title = raw.length <= 100 ? sanitizeText(raw, 100) : '';
  if (!title) {
    res.status(400).json({ error: 'Le titre doit contenir entre 1 et 100 caractères.' });
    return;
  }
  const item = await mutateAuthDb((db) => {
    if (getAccess(req)?.scope !== access.scope) return null;
    const conversation = ownedById(db, req.params.id, access);
    if (!conversation) return null;
    conversation.title = title;
    return conversation;
  });
  if (!item) {
    res.status(404).json(notFound);
    return;
  }
  res.json({ conversation: item });
}

export async function deleteAiConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
  const access = requireAccess(req, res);
  if (!access) return;
  const deleted = await mutateAuthDb((db) => {
    if (getAccess(req)?.scope !== access.scope || !ownedById(db, req.params.id, access)) return false;
    db.ai_messages = db.ai_messages.filter((item) => item.ai_conversation_id !== req.params.id);
    db.ai_conversations = db.ai_conversations.filter((item) => item.id !== req.params.id);
    return true;
  });
  if (!deleted) {
    res.status(404).json(notFound);
    return;
  }
  res.status(204).end();
}

export async function aiAssistantChat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const access = requireAccess(req, res);
  if (!access) return;
  const question = sanitizeText(req.body?.question, 1200);
  const lang = req.body?.lang === 'ar' || req.body?.lang === 'en' ? req.body.lang : 'fr';
  const existingId = req.body?.conversationId;
  if (!question || (existingId !== undefined && (typeof existingId !== 'string' || existingId.length > 100))) {
    res.status(400).json({ error: 'Question ou conversation invalide.' });
    return;
  }

  const db = loadDb();
  const item = existingId ? ownedById(db, existingId, access) : null;
  if (existingId && !item) {
    res.status(404).json(notFound);
    return;
  }
  if (item && isArchived(item, access)) {
    res.status(409).json(archivedError);
    return;
  }
  const conversationId = item?.id ?? newId(`aiconv-${access.scope}`);
  if (pendingConversations.has(conversationId)) {
    res.status(409).json({ error: 'Une réponse est déjà en cours.' });
    return;
  }

  function stillAuthorized() {
    if (getAccess(req)?.scope !== access!.scope) return false;
    return !item || Boolean(getSqliteDb().prepare(
      'SELECT 1 FROM ai_conversations WHERE id = ? AND user_id = ? AND company_id IS ?'
    ).get(conversationId, access!.identity.userId, access!.identity.companyId));
  }

  const streaming = req.get('Accept')?.split(',').some((type) => type.trim() === 'application/x-ndjson');
  const stopped = new AbortController();
  const close = () => stopped.abort();
  const signal = AbortSignal.any([stopped.signal, AbortSignal.timeout(25_000)]);
  res.once('close', close);
  pendingConversations.add(conversationId);
  const emit = (event: object) => {
    if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n');
  };

  try {
    if (streaming) {
      res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
    }
    let permissionLost = false;
    const result = await askHrAssistant({
      db,
      user: access.identity,
      department: access.department,
      question,
      lang,
      history: item ? messagesFor(db, item, access) : [],
      signal,
      onDelta: streaming ? (text) => {
        if (permissionLost || !stillAuthorized()) {
          permissionLost = true;
          stopped.abort();
          return;
        }
        emit({ type: 'delta', text });
      } : undefined,
    });

    if (res.destroyed) return;
    const saved = !permissionLost && await mutateAuthDb((snapshot) => {
      if (res.destroyed || !stillAuthorized()) return false;
      const now = new Date().toISOString();
      if (!item) {
        snapshot.ai_conversations.unshift({
          id: conversationId, company_id: access.identity.companyId, user_id: access.identity.userId,
          title: question.slice(0, 60), created_at: now,
        });
      }
      snapshot.ai_messages.push(
        { id: newId('aim'), ai_conversation_id: conversationId, role: 'user', content: question, created_at: now },
        { id: newId('aim'), ai_conversation_id: conversationId, role: 'assistant', content: result.answer, created_at: now },
      );
      return true;
    });
    if (res.destroyed) return;
    if (!saved) {
      if (streaming) {
        emit({ type: 'error', ...notFound });
        res.end();
      } else {
        res.status(404).json(notFound);
      }
      return;
    }

    const response = { conversationId, answer: result.answer, usedGemini: result.usedGemini, notice: result.error || null };
    if (streaming) {
      emit({ type: 'done', ...response });
      res.end();
    } else {
      res.json(response);
    }
  } catch {
    if (!res.destroyed) {
      const failure = { error: 'La réponse n’a pas pu être enregistrée.' };
      if (streaming && res.headersSent) {
        emit({ type: 'error', ...failure });
        res.end();
      } else {
        res.status(500).json(failure);
      }
    }
  } finally {
    res.off('close', close);
    pendingConversations.delete(conversationId);
  }
}
