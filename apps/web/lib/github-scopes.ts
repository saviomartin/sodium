/** GitHub may normalize `user:email` into the broader `user` scope. */
export function hasRequiredGithubScopes(scopes: readonly string[]): boolean {
  return (
    scopes.includes("repo") &&
    (scopes.includes("user:email") || scopes.includes("user"))
  );
}
