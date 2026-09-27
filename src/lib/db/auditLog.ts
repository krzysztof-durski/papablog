export type AuditAction =
  | 'post.publish'
  | 'post.unpublish'
  | 'draft.create'
  | 'draft.trash'
  | 'draft.restore'
  | 'draft.purge'
  | 'search.reindex';
export type AuditTargetType = 'post' | 'draft' | 'search_index';

export interface AuditLogEntry {
  id: number;
  actorEmail: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogRow {
  id: number;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: string | null;
  created_at: string;
}

function rowToEntry(row: AuditLogRow): AuditLogEntry {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }

  return {
    id: row.id,
    actorEmail: row.actor_email,
    action: row.action as AuditAction,
    targetType: row.target_type as AuditTargetType,
    targetId: row.target_id,
    metadata,
    createdAt: row.created_at,
  };
}

export async function recordAuditLog(
  db: D1Database,
  entry: {
    actorEmail: string;
    action: AuditAction;
    targetType: AuditTargetType;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (actor_email, action, target_type, target_id, metadata)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(
      entry.actorEmail,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    )
    .run();
}

export async function listAuditLog(db: D1Database, limit = 50): Promise<AuditLogEntry[]> {
  const { results } = await db
    .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?1')
    .bind(limit)
    .all<AuditLogRow>();

  return results.map(rowToEntry);
}
