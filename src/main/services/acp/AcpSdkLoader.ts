// ACP SDK is ESM-only — use type imports statically, runtime imports dynamically.
// Use indirect eval to prevent TypeScript from converting import() to require().
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<typeof import('@agentclientprotocol/sdk')>;

let _acpSdk: typeof import('@agentclientprotocol/sdk') | null = null;

export async function getAcpSdk(): Promise<typeof import('@agentclientprotocol/sdk')> {
  if (!_acpSdk) {
    _acpSdk = await dynamicImport('@agentclientprotocol/sdk');
  }
  return _acpSdk;
}

/** Pre-warm the ACP SDK import so the first session doesn't pay the ESM load cost. */
export function warmAcpSdk(): void {
  getAcpSdk().catch(() => {
    /* best-effort */
  });
}
