// A trivial stand-in Worker entry for tests. The real app's `main` (in
// wrangler.jsonc) is Astro's own build-generated entrypoint, which isn't a
// real file the test pool can statically analyze — tests exercise library
// functions and bindings directly instead of routing through the real app,
// so this placeholder is all the pool needs to boot.
export default {
  fetch() {
    return new Response('ok');
  },
};
