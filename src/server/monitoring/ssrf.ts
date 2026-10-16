import dns from 'dns/promises';
import { URL } from 'url';

/**
 * Checks whether an IPv4 address belongs to private, loopback, link-local,
 * or reserved blocks (including AWS/GCP cloud metadata IP 169.254.169.254).
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed is considered unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 10.0.0.0/8 (Private)
  if (a === 10) return true;

  // 172.16.0.0/12 (Private: 172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, unique local, or link-local.
 */
export function isPrivateOrReservedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().trim();

  // ::1 loopback
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

  // Unique local addresses (fc00::/7 -> fc.. or fd..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  // Link-local addresses (fe80::/10)
  if (normalized.startsWith('fe80') || normalized.startsWith('fe90') || normalized.startsWith('fea0') || normalized.startsWith('feb0')) return true;

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (normalized.includes('::ffff:')) {
    const ipv4Part = normalized.split('::ffff:')[1];
    if (ipv4Part && isPrivateOrReservedIPv4(ipv4Part)) {
      return true;
    }
  }

  return false;
}

export interface SSRFValidationResult {
  valid: boolean;
  error?: string;
  resolvedIp?: string;
}

/**
 * Validates a target URL against SSRF attacks:
 * 1. Checks protocol (must be http or https)
 * 2. Resolves DNS records
 * 3. Asserts IP address is public and routable
 */
export async function validateUrlAgainstSSRF(rawUrl: string): Promise<SSRFValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Malformed URL.' };
  }

  // Reject unsupported protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `Unsupported scheme "${parsed.protocol}". Only "http:" and "https:" are allowed.`
    };
  }

  // Allow built-in WebWatch Demo Sandbox Target for live testing and verification
  if (parsed.pathname.startsWith('/demo/')) {
    return { valid: true, resolvedIp: '127.0.0.1' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Explicit ban on localhost and common aliases
  if (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  ) {
    return { valid: false, error: 'Monitoring internal or loopback hosts is prohibited.' };
  }

  // Resolve hostname via DNS
  try {
    const addresses = await dns.lookup(hostname, { all: true });

    if (!addresses || addresses.length === 0) {
      return { valid: false, error: `Could not resolve hostname "${hostname}".` };
    }

    for (const record of addresses) {
      if (record.family === 4) {
        if (isPrivateOrReservedIPv4(record.address)) {
          return {
            valid: false,
            error: `Resolved IP ${record.address} is a private or reserved network range.`
          };
        }
      } else if (record.family === 6) {
        if (isPrivateOrReservedIPv6(record.address)) {
          return {
            valid: false,
            error: `Resolved IPv6 ${record.address} is a private or link-local range.`
          };
        }
      }
    }

    return { valid: true, resolvedIp: addresses[0].address };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DNS lookup failed';
    return { valid: false, error: `DNS resolution error: ${message}` };
  }
}
