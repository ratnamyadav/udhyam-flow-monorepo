// SDK diagnostics must not contain booking capabilities or customer intake.
const DETAILS_REMOVED = 'Diagnostic details removed to protect customer data.';
const withoutQuery = (value: string) =>
  value.split(/[?#]/)[0]?.replace(/(https?:\/\/)[^\s/]*@/g, '$1[redacted]@') ?? '';

export function scrubDiagnosticEvent<
  T extends {
    user?: unknown;
    breadcrumbs?: unknown;
    extra?: unknown;
    tags?: unknown;
    fingerprint?: unknown;
    message?: string;
    logentry?: unknown;
    transaction?: string;
    contexts?: Record<string, unknown>;
    exception?: {
      values?: {
        value?: string;
        mechanism?: { data?: unknown };
        stacktrace?: { frames?: { vars?: unknown; filename?: string; abs_path?: string }[] };
      }[];
    };
    spans?: { data?: unknown; description?: string }[];
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
  // SDK fetch/navigation breadcrumbs carry full tRPC URLs and inputs.
  event.breadcrumbs = undefined;
  event.extra = undefined;
  event.tags = undefined;
  event.fingerprint = undefined;
  event.logentry = undefined;
  if (event.message) event.message = DETAILS_REMOVED;
  if (event.transaction) event.transaction = withoutQuery(event.transaction);
  if (event.contexts) {
    const safe: Record<string, unknown> = {};
    for (const name of ['trace', 'runtime', 'os', 'browser']) {
      const original = event.contexts[name];
      if (!original || typeof original !== 'object') continue;
      const fields =
        name === 'trace'
          ? ['trace_id', 'span_id', 'parent_span_id', 'op', 'status', 'origin']
          : ['name', 'version'];
      const context: Record<string, unknown> = {};
      for (const field of fields) {
        const value = (original as Record<string, unknown>)[field];
        if (typeof value === 'string') context[field] = withoutQuery(value);
      }
      safe[name] = context;
    }
    event.contexts = safe;
  }
  for (const exception of event.exception?.values ?? []) {
    // DB/provider exception messages may include query parameters or input.
    if (exception.value) exception.value = DETAILS_REMOVED;
    if (exception.mechanism) exception.mechanism.data = undefined;
    for (const frame of exception.stacktrace?.frames ?? []) {
      frame.vars = undefined;
      if (frame.filename) frame.filename = withoutQuery(frame.filename);
      if (frame.abs_path) frame.abs_path = withoutQuery(frame.abs_path);
    }
  }
  for (const span of event.spans ?? []) {
    span.data = undefined;
    if (span.description) span.description = withoutQuery(span.description);
  }
  const request = event.request;
  if (!request) return event;
  request.data = undefined;
  request.cookies = undefined;
  request.query_string = undefined;
  if (request.url) request.url = withoutQuery(request.url);
  if (request.headers) {
    for (const key of Object.keys(request.headers)) {
      if (!['accept', 'content-type'].includes(key.toLowerCase())) delete request.headers[key];
    }
  }
  return event;
}

// Sentry 11 streams spans by default: beforeSendTransaction is ignored in
// that lifecycle. Its actual beforeSendSpan payload uses name/attributes.
export function scrubDiagnosticSpan<
  T extends { name: string; attributes: Record<string, unknown>; links?: unknown },
>(span: T): T {
  span.name = withoutQuery(span.name);
  span.links = undefined;
  const safe: Record<string, unknown> = {};
  for (const key of [
    'sentry.op',
    'sentry.origin',
    'sentry.source',
    'sentry.sample_rate',
    'http.request.method',
    'http.response.status_code',
    'http.status_code',
  ]) {
    const value = span.attributes[key];
    if (typeof value === 'string') safe[key] = withoutQuery(value);
    else if (typeof value === 'number' || typeof value === 'boolean') safe[key] = value;
  }
  span.attributes = safe;
  return span;
}

// The SDK also copies the original root-span name into the envelope's
// dynamic sampling context, independently of beforeSendSpan.
export function scrubDiagnosticEnvelope(envelope: unknown): void {
  if (!Array.isArray(envelope)) return;
  const header = envelope[0];
  if (!header || typeof header !== 'object') return;
  const trace = (header as Record<string, unknown>).trace;
  if (trace && typeof trace === 'object') delete (trace as Record<string, unknown>).transaction;
}

const privacyIntegration = {
  name: 'UdyamFlowDiagnosticPrivacy',
  setup(client: { on(hook: 'beforeEnvelope', callback: (envelope: unknown) => void): unknown }) {
    client.on('beforeEnvelope', scrubDiagnosticEnvelope);
  },
};

export const diagnosticPrivacyOptions = {
  integrations: [privacyIntegration],
  traceLifecycle: 'stream' as const,
  enableLogs: false,
  beforeSend: scrubDiagnosticEvent,
  beforeSendSpan: scrubDiagnosticSpan,
};
