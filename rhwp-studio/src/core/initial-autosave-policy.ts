export function shouldSkipInitialAutosaveRecovery(search: string, embedded: boolean): boolean {
  return new URLSearchParams(search).has('url') || embedded;
}
