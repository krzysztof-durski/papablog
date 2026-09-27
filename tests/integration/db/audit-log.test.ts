import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { listAuditLog, recordAuditLog } from '../../../src/lib/db/auditLog';

const WRITER = 'dursky.k@gmail.com';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM audit_log').run();
});

describe('recordAuditLog + listAuditLog', () => {
  it('records an entry with metadata and reads it back', async () => {
    await recordAuditLog(env.DB, {
      actorEmail: WRITER,
      action: 'post.publish',
      targetType: 'post',
      targetId: 'hello-world',
      metadata: { commitSha: 'abc123' },
    });

    const entries = await listAuditLog(env.DB);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorEmail: WRITER,
      action: 'post.publish',
      targetType: 'post',
      targetId: 'hello-world',
      metadata: { commitSha: 'abc123' },
    });
  });

  it('records an entry with no metadata or target as null, not a crash', async () => {
    await recordAuditLog(env.DB, { actorEmail: WRITER, action: 'search.reindex', targetType: 'search_index' });

    const entries = await listAuditLog(env.DB);

    expect(entries[0]?.targetId).toBeNull();
    expect(entries[0]?.metadata).toBeNull();
  });

  it('lists newest first', async () => {
    await recordAuditLog(env.DB, { actorEmail: WRITER, action: 'draft.create', targetType: 'draft', targetId: '1' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await recordAuditLog(env.DB, { actorEmail: WRITER, action: 'draft.create', targetType: 'draft', targetId: '2' });

    const entries = await listAuditLog(env.DB);

    expect(entries.map((e) => e.targetId)).toEqual(['2', '1']);
  });

  it('respects the limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await recordAuditLog(env.DB, {
        actorEmail: WRITER,
        action: 'draft.create',
        targetType: 'draft',
        targetId: String(i),
      });
    }

    const entries = await listAuditLog(env.DB, 2);

    expect(entries).toHaveLength(2);
  });
});
