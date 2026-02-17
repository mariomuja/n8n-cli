import { describe, it, expect } from 'vitest';
import { toFriendlyApiError } from '../src/n8n-client.js';

describe('toFriendlyApiError', () => {
  it('returns friendly message for 401 unauthorized', () => {
    const err = new Error('n8n API error 401: unauthorized');
    expect(toFriendlyApiError(err)).toContain('Invalid API key');
    expect(toFriendlyApiError(err)).toContain('Settings → API');
  });

  it('returns friendly message for 401 in message', () => {
    expect(toFriendlyApiError(new Error('401'))).toContain('Invalid API key');
  });

  it('returns friendly message for 403 forbidden', () => {
    const err = new Error('n8n API error 403: forbidden');
    expect(toFriendlyApiError(err)).toContain('Access denied');
    expect(toFriendlyApiError(err)).toContain('403');
  });

  it('returns friendly message for 404 not found', () => {
    const err = new Error('404 not found');
    expect(toFriendlyApiError(err)).toContain('n8n instance not found');
  });

  it('returns friendly message for ENOTFOUND in cause', () => {
    const err = new Error('fetch failed');
    (err as Error & { cause?: NodeJS.ErrnoException }).cause = {
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND',
    } as NodeJS.ErrnoException;
    expect(toFriendlyApiError(err)).toContain('Cannot resolve n8n hostname');
  });

  it('returns friendly message for ENOTFOUND in causeMsg', () => {
    const err = new Error('fetch failed');
    (err as Error & { cause?: Error }).cause = new Error('ENOTFOUND something');
    expect(toFriendlyApiError(err)).toContain('Cannot resolve n8n hostname');
  });

  it('returns friendly message for getaddrinfo in message', () => {
    const err = new Error('getaddrinfo ENOTFOUND host.example.com');
    expect(toFriendlyApiError(err)).toContain('Cannot resolve n8n hostname');
  });

  it('returns friendly message for ECONNREFUSED in cause', () => {
    const err = new Error('fetch failed');
    (err as Error & { cause?: NodeJS.ErrnoException }).cause = {
      code: 'ECONNREFUSED',
      message: 'Connection refused',
    } as NodeJS.ErrnoException;
    expect(toFriendlyApiError(err)).toContain('Cannot connect to n8n');
    expect(toFriendlyApiError(err)).toContain('npx n8n');
  });

  it('returns friendly message for ECONNREFUSED in causeMsg', () => {
    const err = new Error('fetch failed');
    (err as Error & { cause?: Error }).cause = new Error('ECONNREFUSED');
    expect(toFriendlyApiError(err)).toContain('Cannot connect to n8n');
  });

  it('returns friendly message for SELF_SIGNED_CERT_IN_CHAIN', () => {
    const err = new Error('fetch failed');
    (err as Error & { cause?: NodeJS.ErrnoException }).cause = {
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
      message: 'Self-signed certificate',
    } as NodeJS.ErrnoException;
    expect(toFriendlyApiError(err)).toContain('Self-signed certificate');
    expect(toFriendlyApiError(err)).toContain('rejectUnauthorized');
  });

  it('returns friendly message for self-signed in message', () => {
    const err = new Error('self-signed certificate in certificate chain');
    expect(toFriendlyApiError(err)).toContain('Self-signed certificate');
  });

  it('returns friendly message for timeout', () => {
    const err = new Error('n8n API request timed out after 30000ms');
    expect(toFriendlyApiError(err)).toContain('Request timed out');
  });

  it('returns friendly message for AbortError', () => {
    const err = new Error('AbortError');
    expect(toFriendlyApiError(err)).toContain('Request timed out');
  });

  it('adds hint for generic n8n API error', () => {
    const err = new Error('n8n API error 500: Internal Server Error');
    expect(toFriendlyApiError(err)).toContain('n8n API error 500');
    expect(toFriendlyApiError(err)).toContain('Check baseUrl and apiKey');
  });

  it('returns friendly message for fetch failed with cause', () => {
    const err = new Error('fetch failed');
    (err as Error & { cause?: Error }).cause = new Error('Connection reset');
    expect(toFriendlyApiError(err)).toContain('Connection failed');
    expect(toFriendlyApiError(err)).toContain('Connection reset');
  });

  it('returns friendly message for fetch failed without cause', () => {
    const err = new Error('fetch failed');
    expect(toFriendlyApiError(err)).toContain('Connection failed');
    expect(toFriendlyApiError(err)).toContain('fetch failed');
  });

  it('returns message as-is for unknown errors', () => {
    const err = new Error('Something else went wrong');
    expect(toFriendlyApiError(err)).toBe('Something else went wrong');
  });

  it('handles non-Error values', () => {
    expect(toFriendlyApiError('string error')).toBe('string error');
  });
});
