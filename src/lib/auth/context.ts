/**
 * Every /admin and /api/admin/* route is gated by src/middleware.ts, which
 * always sets locals.accessEmail before the handler runs. This gives a
 * typed read of it without scattering non-null assertions through every
 * route — and throws (500) rather than silently proceeding if it's ever
 * missing, since that would mean the middleware gate itself is broken.
 */
export function getAccessEmail(locals: App.Locals): string {
  if (!locals.accessEmail) {
    throw new Error('getAccessEmail() called outside the Access-gated middleware path');
  }
  return locals.accessEmail;
}
