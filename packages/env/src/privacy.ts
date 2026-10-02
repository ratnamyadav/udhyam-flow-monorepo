// Booking links and tRPC inputs can contain customer data and capabilities.
// Keep error diagnostics while removing request payloads, identity and queries.
export function scrubDiagnosticEvent<
  T extends {
    user?: unknown;
    request?: {
      url?: string;
      query_string?: unknown;
      data?: unknown;
      cookies?: unknown;
      headers?: Record<string, string>;
    };
  },
>(event: T): T {
  event.user = undefined;
  const request = event.request;
  if (!request) return event;
  request.data = undefined;
  request.cookies = undefined;
  request.query_string = undefined;
  if (request.url) {
    try {
      const url = new URL(request.url);
      url.search = '';
      url.hash = '';
      request.url = url.toString();
    } catch {
      request.url = request.url.split(/[?#]/)[0];
    }
  }
  if (request.headers) {
    for (const key of Object.keys(request.headers)) {
      if (['authorization', 'cookie', 'set-cookie', 'x-api-key'].includes(key.toLowerCase()))
        delete request.headers[key];
    }
  }
  return event;
}
