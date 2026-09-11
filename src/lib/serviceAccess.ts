/**
 * Stable, service-facing access identifiers. A service name is normalised once
 * when the service is created; later catalogue copy edits do not rename scopes.
 */
export function serviceAccessKey(name: string): string {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error("A service needs an English access key");
  if (key.length > 50) throw new Error("A service access key cannot exceed 50 characters");
  return key;
}

export function serviceRoleScope(accessKey: string, role: string): string {
  return `${accessKey}-${role}`.toLowerCase();
}
