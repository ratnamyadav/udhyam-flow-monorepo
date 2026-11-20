import { describe, expect, it } from 'vitest';
import { reviewLoginCode } from '../src/review-login';

const env = { REVIEW_LOGIN_EMAIL: 'AppReview@Example.com', REVIEW_LOGIN_CODE: '482913' };

describe('reviewLoginCode', () => {
  it('returns the fixed code for the review account, ignoring case and spaces', () => {
    expect(reviewLoginCode(' appreview@example.com ', env)).toBe('482913');
  });

  it('returns nothing for every other account', () => {
    expect(reviewLoginCode('owner@example.com', env)).toBeNull();
    expect(reviewLoginCode('appreview@example.com.evil.test', env)).toBeNull();
  });

  it('is off unless both variables are set and the code is 6 digits', () => {
    const email = 'appreview@example.com';
    expect(reviewLoginCode(email, {})).toBeNull();
    expect(reviewLoginCode(email, { REVIEW_LOGIN_EMAIL: env.REVIEW_LOGIN_EMAIL })).toBeNull();
    expect(reviewLoginCode(email, { REVIEW_LOGIN_CODE: '482913' })).toBeNull();
    expect(reviewLoginCode(email, { ...env, REVIEW_LOGIN_CODE: '1234' })).toBeNull();
    expect(reviewLoginCode(email, { ...env, REVIEW_LOGIN_CODE: 'abcdef' })).toBeNull();
    expect(reviewLoginCode(email, { ...env, REVIEW_LOGIN_EMAIL: '  ' })).toBeNull();
  });
});
