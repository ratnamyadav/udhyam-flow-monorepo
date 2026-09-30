import { describe, expect, it } from 'vitest';
import {
  buildOnlineSessionEmail,
  generateJitsiUrl,
  isValidMeetingUrl,
  meetingUrlInput,
  resolveMeetingUrl,
} from '../src/online';
import { bearerToken, secretsMatch } from '../src/shared-secret';
import { bookingUrlFor, sanitizeSource } from '../src/source';

describe('meeting URLs', () => {
  it('accepts https Meet / Zoom / Jitsi links', () => {
    expect(isValidMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(isValidMeetingUrl('https://us02web.zoom.us/j/1234567890?pwd=xyz')).toBe(true);
    expect(isValidMeetingUrl('https://meet.jit.si/udyamflow-abc')).toBe(true);
  });

  it('rejects non-https, credentials, junk and overlong values', () => {
    expect(isValidMeetingUrl('http://meet.google.com/abc')).toBe(false);
    expect(isValidMeetingUrl('javascript:alert(1)')).toBe(false);
    expect(isValidMeetingUrl('https://user:pass@zoom.us/j/1')).toBe(false);
    expect(isValidMeetingUrl('meet.google.com/abc')).toBe(false);
    expect(isValidMeetingUrl('')).toBe(false);
    expect(isValidMeetingUrl(`https://zoom.us/${'a'.repeat(600)}`)).toBe(false);
  });

  it('input schema trims, clears on empty, rejects http', () => {
    expect(meetingUrlInput.parse('  https://zoom.us/j/1  ')).toBe('https://zoom.us/j/1');
    expect(meetingUrlInput.parse('')).toBeNull();
    expect(meetingUrlInput.parse(null)).toBeNull();
    expect(meetingUrlInput.safeParse('http://zoom.us/j/1').success).toBe(false);
  });

  it('generates unique, url-safe Jitsi rooms', () => {
    const a = generateJitsiUrl();
    const b = generateJitsiUrl();
    expect(a).toMatch(/^https:\/\/meet\.jit\.si\/udyamflow-[a-z0-9]{16}$/);
    expect(a).not.toBe(b);
    expect(isValidMeetingUrl(a)).toBe(true);
  });

  it('prefers the resource room, falls back to Jitsi, skips in-person', () => {
    expect(
      resolveMeetingUrl({ serviceIsOnline: false, resourceMeetingUrl: 'https://zoom.us/j/1' }),
    ).toBeNull();
    expect(
      resolveMeetingUrl({ serviceIsOnline: true, resourceMeetingUrl: 'https://zoom.us/j/1' }),
    ).toBe('https://zoom.us/j/1');
    expect(resolveMeetingUrl({ serviceIsOnline: true, resourceMeetingUrl: null })).toMatch(
      /^https:\/\/meet\.jit\.si\//,
    );
    // A legacy non-https value on the resource is never sent out.
    expect(
      resolveMeetingUrl({ serviceIsOnline: true, resourceMeetingUrl: 'http://zoom.us/j/1' }),
    ).toMatch(/^https:\/\/meet\.jit\.si\//);
  });

  it('escapes customer-supplied text in the email', () => {
    const { html, subject } = buildOnlineSessionEmail({
      customerName: '<b>Eve</b> X',
      resourceName: 'Dr. P',
      when: '2 Oct, 15:30',
      referenceCode: 'ABC123',
      meetingUrl: 'https://zoom.us/j/1?a=1&b=2',
    });
    expect(html).not.toContain('<b>Eve</b>');
    expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(html).toContain('href="https://zoom.us/j/1?a=1&amp;b=2"');
    expect(subject).toContain('2 Oct, 15:30');
  });
});

describe('sanitizeSource', () => {
  it('lowercases and keeps valid slugs', () => {
    expect(sanitizeSource('Google')).toBe('google');
    expect(sanitizeSource(' instagram ')).toBe('instagram');
    expect(sanitizeSource('gbp_2026-q3')).toBe('gbp_2026-q3');
  });

  it('drops anything else to null', () => {
    expect(sanitizeSource('')).toBeNull();
    expect(sanitizeSource('a'.repeat(33))).toBeNull();
    expect(sanitizeSource('google ads')).toBeNull();
    expect(sanitizeSource('<script>')).toBeNull();
    expect(sanitizeSource('fb.com')).toBeNull();
    expect(sanitizeSource(undefined)).toBeNull();
    expect(sanitizeSource(42)).toBeNull();
  });

  it('builds booking URLs with an optional source', () => {
    expect(bookingUrlFor('https://app.test/', 'patel-clinic')).toBe(
      'https://app.test/book/patel-clinic',
    );
    expect(bookingUrlFor('https://app.test', 'patel-clinic', 'google')).toBe(
      'https://app.test/book/patel-clinic?source=google',
    );
  });
});

describe('shared secrets', () => {
  it('compares in constant time regardless of length', () => {
    expect(secretsMatch('s3cret', 's3cret')).toBe(true);
    expect(secretsMatch('s3cret', 's3cret-longer')).toBe(false);
    expect(secretsMatch('', 's3cret')).toBe(false);
    expect(secretsMatch(null, 's3cret')).toBe(false);
    expect(secretsMatch('x', '')).toBe(false);
  });

  it('extracts bearer tokens', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer  abc ')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
