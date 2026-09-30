import { REPLY_ACTIONS, type ReplyAction } from './reminders';

// Parsing for MSG91 inbound WhatsApp webhooks (customer taps a quick-reply
// button on the reminder).
//
// ASSUMPTION — MSG91 doesn't publish a schema we could check from here, so
// this accepts every shape we know of and ignores anything else:
//   • MSG91 flattened: { customerNumber, contentType: 'button', text,
//     button: {payload,text} | '<json string>', messages: [...] | '<json>' }
//   • Meta Cloud-API message objects, either as MSG91's `messages` array or
//     the raw `entry[].changes[].value.messages[]` envelope:
//       template quick reply → { from, type:'button', button:{payload,text} }
//       interactive reply    → { from, interactive:{button_reply:{id,title}} }
//   • Top-level `payload` / `button_payload` / `buttonPayload` strings.
// The payload we sent is `<action>:<bookingId>`. If only the button *label*
// comes through ("Confirm"), we return the action with bookingId=null and
// the handler resolves the booking from the sender's recent reminders.

export type InboundReply = {
  from: string | null;
  action: ReplyAction;
  bookingId: string | null;
};

type Obj = Record<string, unknown>;

const PAYLOAD_RE = /^(confirm|cancel|reschedule):([A-Za-z0-9_-]{1,100})$/;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// MSG91 is known to JSON-encode nested fields (e.g. `messages`) as strings.
function maybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return v;
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function asArray(v: unknown): unknown[] {
  const parsed = maybeJson(v);
  if (Array.isArray(parsed)) return parsed;
  return isObj(parsed) ? [parsed] : [];
}

export function parseReplyPayload(raw: string): { action: ReplyAction; bookingId: string } | null {
  const m = PAYLOAD_RE.exec(raw.trim());
  if (!m) return null;
  return { action: m[1] as ReplyAction, bookingId: m[2]! };
}

function actionFromLabel(raw: string): ReplyAction | null {
  const label = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return (REPLY_ACTIONS as readonly string[]).includes(label) ? (label as ReplyAction) : null;
}

// Every object that might be "the message": the body itself, MSG91's
// `messages`, and Meta's webhook envelope.
function messageCandidates(body: Obj): Obj[] {
  const out: Obj[] = [body];
  for (const m of asArray(body.messages)) if (isObj(m)) out.push(m);
  for (const entry of asArray(body.entry)) {
    if (!isObj(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isObj(change) || !isObj(change.value)) continue;
      for (const m of asArray(change.value.messages)) if (isObj(m)) out.push(m);
    }
  }
  return out;
}

function senderOf(body: Obj, candidates: Obj[]): string | null {
  for (const key of ['customerNumber', 'customer_number', 'from', 'sender', 'mobile', 'waId']) {
    const v = str(body[key]);
    if (v) return v;
  }
  for (const c of candidates) {
    const v = str(c.from);
    if (v) return v;
  }
  const contacts = [
    ...asArray(body.contacts),
    ...asArray(body.entry).flatMap((e) =>
      isObj(e)
        ? asArray(e.changes).flatMap((c) =>
            isObj(c) && isObj(c.value) ? asArray(c.value.contacts) : [],
          )
        : [],
    ),
  ];
  for (const c of contacts) {
    if (isObj(c)) {
      const v = str(c.wa_id);
      if (v) return v;
    }
  }
  return null;
}

// Pulls (payload-ish, label-ish) strings out of one candidate message.
function buttonStrings(c: Obj): { payloads: string[]; labels: string[] } {
  const payloads: string[] = [];
  const labels: string[] = [];
  const push = (arr: string[], v: unknown) => {
    const s = str(v);
    if (s) arr.push(s);
  };

  const button = maybeJson(c.button);
  if (isObj(button)) {
    push(payloads, button.payload);
    push(payloads, button.id);
    push(labels, button.text);
    push(labels, button.title);
  } else {
    push(payloads, button);
  }

  const interactive = maybeJson(c.interactive);
  if (isObj(interactive) && isObj(interactive.button_reply)) {
    push(payloads, interactive.button_reply.id);
    push(labels, interactive.button_reply.title);
  }

  push(payloads, c.payload);
  push(payloads, c.button_payload);
  push(payloads, c.buttonPayload);

  // Flattened MSG91 bodies may carry the tapped label (or payload) in `text`,
  // but only trust it when the message says it's a button reply — a typed
  // "cancel" in free chat shouldn't cancel anything.
  const kind = (str(c.contentType) ?? str(c.content_type) ?? str(c.type) ?? '').toLowerCase();
  if (kind === 'button' || kind === 'interactive') {
    const text = isObj(c.text) ? c.text.body : c.text;
    push(payloads, text);
    push(labels, text);
  }
  return { payloads, labels };
}

export function parseInboundWhatsApp(raw: unknown): InboundReply | null {
  const body = maybeJson(raw);
  if (!isObj(body)) return null;
  const candidates = messageCandidates(body);
  const from = senderOf(body, candidates);

  let labelAction: ReplyAction | null = null;
  for (const c of candidates) {
    const { payloads, labels } = buttonStrings(c);
    for (const p of payloads) {
      const parsed = parseReplyPayload(p);
      if (parsed) return { from, ...parsed };
    }
    for (const l of labels) {
      labelAction ??= actionFromLabel(l);
    }
  }
  return labelAction ? { from, action: labelAction, bookingId: null } : null;
}

// Canonical digits for comparing a WhatsApp sender with the phone the
// customer typed on the booking form: strip formatting, drop a trunk `0`,
// and assume India (+91) for bare 10-digit numbers.
export function normalizePhoneForMatch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 8 ? digits : null;
}

// Anti-spoofing gate: a reply only acts on a booking whose customerPhone is
// the sender. Booking ids are unguessable, but payloads are just strings
// anyone could craft, so we never trust the id alone.
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhoneForMatch(a);
  const nb = normalizePhoneForMatch(b);
  return na !== null && na === nb;
}
