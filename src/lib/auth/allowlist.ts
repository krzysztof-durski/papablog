/**
 * Defense-in-depth on top of Access itself: even if the Access application's
 * own policy were ever misconfigured to allow more than intended, the Worker
 * independently re-checks the verified email against this allow-list before
 * granting write access.
 */
export function isAllowedWriter(email: string, allowedEmailsCsv: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allowed = allowedEmailsCsv
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(normalized);
}
