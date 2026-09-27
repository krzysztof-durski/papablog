import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDraft, deleteDraft, getDraft, listDrafts, updateDraft } from '../../../src/lib/db/drafts';

const WRITER = 'dursky.k@gmail.com';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM drafts').run();
});

describe('createDraft', () => {
  it('creates an empty draft owned by the given writer', async () => {
    const draft = await createDraft(env.DB, WRITER);

    expect(draft.id).toBeTruthy();
    expect(draft.title).toBe('');
    expect(draft.tags).toEqual([]);
    expect(draft.status).toBe('draft');
    expect(draft.createdBy).toBe(WRITER);
    expect(draft.updatedBy).toBe(WRITER);
    expect(draft.slug).toBeNull();
  });

  it('assigns a distinct id to each draft', async () => {
    const a = await createDraft(env.DB, WRITER);
    const b = await createDraft(env.DB, WRITER);
    expect(a.id).not.toBe(b.id);
  });
});

describe('getDraft', () => {
  it('returns the draft by id', async () => {
    const created = await createDraft(env.DB, WRITER);
    const fetched = await getDraft(env.DB, created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('returns null for a nonexistent id', async () => {
    const fetched = await getDraft(env.DB, crypto.randomUUID());
    expect(fetched).toBeNull();
  });
});

describe('updateDraft', () => {
  it('updates only the fields provided', async () => {
    const created = await createDraft(env.DB, WRITER);

    const updated = await updateDraft(env.DB, created.id, { title: 'My Title' }, WRITER);

    expect(updated?.title).toBe('My Title');
    expect(updated?.description).toBe('');
  });

  it('persists tags as an array round-trip', async () => {
    const created = await createDraft(env.DB, WRITER);

    const updated = await updateDraft(env.DB, created.id, { tags: ['astro', 'cloudflare'] }, WRITER);

    expect(updated?.tags).toEqual(['astro', 'cloudflare']);
  });

  it('bumps updated_at and records who made the change', async () => {
    const created = await createDraft(env.DB, WRITER);

    const updated = await updateDraft(env.DB, created.id, { title: 'x' }, 'second-writer@example.com');

    expect(updated?.updatedBy).toBe('second-writer@example.com');
    expect(updated?.createdBy).toBe(WRITER);
  });

  it('returns null when updating a nonexistent draft', async () => {
    const updated = await updateDraft(env.DB, crypto.randomUUID(), { title: 'x' }, WRITER);
    expect(updated).toBeNull();
  });
});

describe('listDrafts', () => {
  it('lists drafts newest-updated first', async () => {
    const first = await createDraft(env.DB, WRITER);
    const second = await createDraft(env.DB, WRITER);
    // updated_at has millisecond resolution; force the update into a
    // distinct millisecond so ordering isn't racing the clock's tick.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await updateDraft(env.DB, first.id, { title: 'touched again' }, WRITER);

    const drafts = await listDrafts(env.DB);

    expect(drafts.map((d) => d.id)).toEqual([first.id, second.id]);
  });

  it('filters by status when given', async () => {
    await createDraft(env.DB, WRITER);

    const published = await listDrafts(env.DB, 'published');
    const stillDrafts = await listDrafts(env.DB, 'draft');

    expect(published).toHaveLength(0);
    expect(stillDrafts).toHaveLength(1);
  });
});

describe('deleteDraft', () => {
  it('deletes a never-published draft and reports success', async () => {
    const created = await createDraft(env.DB, WRITER);

    const deleted = await deleteDraft(env.DB, created.id);

    expect(deleted).toBe(true);
    expect(await getDraft(env.DB, created.id)).toBeNull();
  });

  it('refuses to delete a published draft', async () => {
    const created = await createDraft(env.DB, WRITER);
    await env.DB.prepare("UPDATE drafts SET status = 'published' WHERE id = ?1").bind(created.id).run();

    const deleted = await deleteDraft(env.DB, created.id);

    expect(deleted).toBe(false);
    expect(await getDraft(env.DB, created.id)).not.toBeNull();
  });

  it('returns false for a nonexistent id', async () => {
    expect(await deleteDraft(env.DB, crypto.randomUUID())).toBe(false);
  });
});
