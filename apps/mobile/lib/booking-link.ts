/**
 * Accepts a bare code ("patel-clinic") or a booking link in any common shape:
 * https://udyamflow.com/book/patel-clinic, …/patel-clinic/, …?layout=compact,
 * udyamflow.com/book/patel-clinic#top, udyamflow://book/patel-clinic.
 */
export function parseWorkspaceCode(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '') // query string / hash
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  const fromLink = s.match(/(?:^|\/)book\/([^/]+)/);
  if (fromLink?.[1]) return fromLink[1];
  return s.replace(/\/+$/, '');
}
