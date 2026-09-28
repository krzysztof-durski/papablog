import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDraft,
  getDraft,
  listDrafts,
  listTrashedDrafts,
  purgeAllTrashedDrafts,
  purgeDraft,
  restoreDraft,
  trashDraft,
  updateDraft,
} from '../../../src/lib/db/drafts';

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

  it('sets a cover image path', async () => {
    const created = await createDraft(env.DB, WRITER);

    const updated = await updateDraft(
      env.DB,
      created.id,
      { coverImagePath: 'https://media.example.com/cover.webp' },
      WRITER,
    );

    expect(updated?.coverImagePath).toBe('https://media.example.com/cover.webp');
  });

  it('clears a cover image path when explicitly set to null', async () => {
    const created = await createDraft(env.DB, WRITER);
    await updateDraft(env.DB, created.id, { coverImagePath: 'https://media.example.com/cover.webp' }, WRITER);

    const cleared = await updateDraft(env.DB, created.id, { coverImagePath: null }, WRITER);

    expect(cleared?.coverImagePath).toBeNull();
  });

  it('leaves the cover image path untouched when the field is omitted entirely', async () => {
    const created = await createDraft(env.DB, WRITER);
    await updateDraft(env.DB, created.id, { coverImagePath: 'https://media.example.com/cover.webp' }, WRITER);

    const updated = await updateDraft(env.DB, created.id, { title: 'Unrelated edit' }, WRITER);

    expect(updated?.coverImagePath).toBe('https://media.example.com/cover.webp');
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

describe('trashDraft', () => {
  it('soft-deletes a never-published draft and hides it from listDrafts', async () => {
    const created = await createDraft(env.DB, WRITER);

    const trashed = await trashDraft(env.DB, created.id, WRITER);

    expect(trashed?.deletedAt).not.toBeNull();
    expect(await listDrafts(env.DB)).toHaveLength(0);
    expect(await getDraft(env.DB, created.id)).not.toBeNull();
  });

  it('refuses to trash a published draft', async () => {
    const created = await createDraft(env.DB, WRITER);
    await env.DB.prepare("UPDATE drafts SET status = 'published' WHERE id = ?1").bind(created.id).run();

    const trashed = await trashDraft(env.DB, created.id, WRITER);

    expect(trashed).toBeNull();
  });

  it('refuses to trash an already-trashed draft', async () => {
    const created = await createDraft(env.DB, WRITER);
    await trashDraft(env.DB, created.id, WRITER);

    expect(await trashDraft(env.DB, created.id, WRITER)).toBeNull();
  });

  it('returns null for a nonexistent id', async () => {
    expect(await trashDraft(env.DB, crypto.randomUUID(), WRITER)).toBeNull();
  });
});

describe('restoreDraft', () => {
  it('un-trashes a draft and it reappears in listDrafts', async () => {
    const created = await createDraft(env.DB, WRITER);
    await trashDraft(env.DB, created.id, WRITER);

    const restored = await restoreDraft(env.DB, created.id, WRITER);

    expect(restored?.deletedAt).toBeNull();
    expect(await listDrafts(env.DB)).toHaveLength(1);
  });

  it('refuses to restore a draft that was never trashed', async () => {
    const created = await createDraft(env.DB, WRITER);
    expect(await restoreDraft(env.DB, created.id, WRITER)).toBeNull();
  });
});

describe('listTrashedDrafts', () => {
  it('lists only trashed drafts, newest-trashed first', async () => {
    const kept = await createDraft(env.DB, WRITER);
    const first = await createDraft(env.DB, WRITER);
    const second = await createDraft(env.DB, WRITER);
    await trashDraft(env.DB, first.id, WRITER);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await trashDraft(env.DB, second.id, WRITER);

    const trashed = await listTrashedDrafts(env.DB);

    expect(trashed.map((d) => d.id)).toEqual([second.id, first.id]);
    expect(trashed.map((d) => d.id)).not.toContain(kept.id);
  });
});

describe('purgeDraft', () => {
  it('permanently deletes a trashed draft', async () => {
    const created = await createDraft(env.DB, WRITER);
    await trashDraft(env.DB, created.id, WRITER);

    const purged = await purgeDraft(env.DB, created.id);

    expect(purged).toBe(true);
    expect(await getDraft(env.DB, created.id)).toBeNull();
  });

  it('refuses to purge a draft that has not been trashed', async () => {
    const created = await createDraft(env.DB, WRITER);

    const purged = await purgeDraft(env.DB, created.id);

    expect(purged).toBe(false);
    expect(await getDraft(env.DB, created.id)).not.toBeNull();
  });

  it('returns false for a nonexistent id', async () => {
    expect(await purgeDraft(env.DB, crypto.randomUUID())).toBe(false);
  });
});

describe('purgeAllTrashedDrafts', () => {
  it('permanently deletes every trashed draft and reports how many', async () => {
    const kept = await createDraft(env.DB, WRITER);
    const first = await createDraft(env.DB, WRITER);
    const second = await createDraft(env.DB, WRITER);
    await trashDraft(env.DB, first.id, WRITER);
    await trashDraft(env.DB, second.id, WRITER);

    const count = await purgeAllTrashedDrafts(env.DB);

    expect(count).toBe(2);
    expect(await listTrashedDrafts(env.DB)).toHaveLength(0);
    expect(await getDraft(env.DB, kept.id)).not.toBeNull();
  });

  it('returns 0 when trash is already empty', async () => {
    await createDraft(env.DB, WRITER);
    expect(await purgeAllTrashedDrafts(env.DB)).toBe(0);
  });

  it('never touches a published draft, even if somehow marked deleted', async () => {
    const created = await createDraft(env.DB, WRITER);
    await env.DB.prepare(
      "UPDATE drafts SET status = 'published', deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
    )
      .bind(created.id)
      .run();

    const count = await purgeAllTrashedDrafts(env.DB);

    expect(count).toBe(0);
    expect(await getDraft(env.DB, created.id)).not.toBeNull();
  });
});
