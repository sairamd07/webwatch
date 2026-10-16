import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIPv4, isPrivateOrReservedIPv6, validateUrlAgainstSSRF } from '../src/server/monitoring/ssrf.js';

describe('SSRF Protection Validator', () => {
  it('correctly flags loopback IPv4 addresses as private/reserved', () => {
    expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('127.1.2.3')).toBe(true);
  });

  it('correctly flags private RFC 1918 blocks', () => {
    expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('10.254.1.2')).toBe(true);
    expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
  });

  it('correctly flags cloud metadata IP (169.254.169.254)', () => {
    expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
  });

  it('permits public routable IPv4 addresses', () => {
    expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false);
    expect(isPrivateOrReservedIPv4('142.250.190.46')).toBe(false);
  });

  it('flags IPv6 loopback and private blocks', () => {
    expect(isPrivateOrReservedIPv6('::1')).toBe(true);
    expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);
  });

  it('rejects unsupported URL schemes like file:// and javascript:', async () => {
    const fileRes = await validateUrlAgainstSSRF('file:///etc/passwd');
    expect(fileRes.valid).toBe(false);
    expect(fileRes.error).toContain('Unsupported scheme');

    const jsRes = await validateUrlAgainstSSRF('javascript:alert(1)');
    expect(jsRes.valid).toBe(false);
  });

  it('rejects localhost hostnames', async () => {
    const res = await validateUrlAgainstSSRF('http://localhost:8080/admin');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('loopback');
  });
});
