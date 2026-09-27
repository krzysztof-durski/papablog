import type { APIRoute } from 'astro';

export const prerender = false;

// Set by src/middleware.ts's Access gate before this handler ever runs.
export const GET: APIRoute = ({ locals }) => {
  return Response.json({ email: locals.accessEmail });
};
