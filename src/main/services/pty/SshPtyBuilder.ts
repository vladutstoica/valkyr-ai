import { eq } from 'drizzle-orm';
import { getDrizzleClient } from '../../db/drizzleClient';
import { sshConnections as sshConnectionsTable } from '../../db/schema';
import { getProvider, type ProviderId } from '../../../shared/providers/registry';

export function quoteShellArg(arg: string): string {
  return /[\s'"\\$`\n\r\t]/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg;
}

export function escapeForDoubleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildRemoteInitCommand(args: {
  cwd?: string;
  provider?: { cli: string; cmd: string; installCommand?: string };
}): string {
  const parts: string[] = [];
  if (args.cwd) {
    // Avoid `cd --` for maximum shell portability.
    parts.push(
      `cd ${quoteShellArg(args.cwd)} || echo "valkyr: could not cd to ${escapeForDoubleQuotes(args.cwd)}"`
    );
  }
  if (args.provider) {
    const cli = args.provider.cli;
    const install = args.provider.installCommand ? ` Install: ${args.provider.installCommand}` : '';
    const msg = `valkyr: ${cli} not found on remote.${install}`;
    parts.push(
      `if command -v ${quoteShellArg(cli)} >/dev/null 2>&1; then ${args.provider.cmd}; else echo "${escapeForDoubleQuotes(
        msg
      )}"; fi`
    );
  }

  // Prefer bash for interactive shells when available.
  // This avoids bash-specific init scripts failing under /bin/sh (e.g. `[[` not found).
  parts.push(
    `if [ -x /bin/bash ]; then exec /bin/bash -i; elif [ -x /usr/bin/bash ]; then exec /usr/bin/bash -i; elif command -v bash >/dev/null 2>&1; then exec bash -i; else exec "${'${SHELL:-sh}'}" -i; fi`
  );

  const init = parts.join('; ');
  const quotedInit = quoteShellArg(init);

  // Ensure init runs under bash when available (falls back to sh).
  // We log the chosen shell minimally to the terminal output.
  return `if [ -x /bin/bash ]; then echo "valkyr: remote init shell=/bin/bash"; exec /bin/bash -ic ${quotedInit}; elif [ -x /usr/bin/bash ]; then echo "valkyr: remote init shell=/usr/bin/bash"; exec /usr/bin/bash -ic ${quotedInit}; elif command -v bash >/dev/null 2>&1; then echo "valkyr: remote init shell=bash"; exec bash -ic ${quotedInit}; else echo "valkyr: remote init shell=sh"; exec sh -ic ${quotedInit}; fi`;
}

export async function resolveSshInvocation(
  connectionId: string
): Promise<{ target: string; args: string[] }> {
  // If created from ssh config selection, prefer using the alias so OpenSSH config
  // (ProxyJump, UseKeychain, etc.) is honored by system ssh.
  if (connectionId.startsWith('ssh-config:')) {
    const raw = connectionId.slice('ssh-config:'.length);
    let alias = raw;
    try {
      // New scheme uses encodeURIComponent.
      if (/%[0-9A-Fa-f]{2}/.test(raw)) {
        alias = decodeURIComponent(raw);
      }
    } catch {
      alias = raw;
    }
    if (alias) {
      return { target: alias, args: [] };
    }
  }

  const { db } = await getDrizzleClient();
  const rows = await db
    .select({
      id: sshConnectionsTable.id,
      host: sshConnectionsTable.host,
      port: sshConnectionsTable.port,
      username: sshConnectionsTable.username,
      privateKeyPath: sshConnectionsTable.privateKeyPath,
    })
    .from(sshConnectionsTable)
    .where(eq(sshConnectionsTable.id, connectionId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error(`SSH connection not found: ${connectionId}`);
  }

  const args: string[] = [];
  if (row.port && row.port !== 22) {
    args.push('-p', String(row.port));
  }
  if (row.privateKeyPath) {
    args.push('-i', row.privateKeyPath);
  }

  const target = row.username ? `${row.username}@${row.host}` : row.host;
  return { target, args };
}

export function buildRemoteProviderInvocation(args: {
  providerId: string;
  autoApprove?: boolean;
  initialPrompt?: string;
  resume?: boolean;
}): { cli: string; cmd: string; installCommand?: string } {
  const { providerId, autoApprove, initialPrompt, resume } = args;
  const provider = getProvider(providerId as ProviderId);

  const cliArgs: string[] = [];
  if (provider?.resumeFlag && resume) {
    cliArgs.push(...provider.resumeFlag.split(' '));
  }
  if (provider?.defaultArgs?.length) {
    cliArgs.push(...provider.defaultArgs);
  }
  if (autoApprove && provider?.autoApproveFlag) {
    cliArgs.push(provider.autoApproveFlag);
  }
  if (provider?.initialPromptFlag !== undefined && initialPrompt?.trim()) {
    if (provider.initialPromptFlag) {
      cliArgs.push(provider.initialPromptFlag);
    }
    cliArgs.push(initialPrompt.trim());
  }

  const cliCommand = provider?.cli || providerId.toLowerCase();
  const cmd =
    cliArgs.length > 0 ? `${cliCommand} ${cliArgs.map(quoteShellArg).join(' ')}` : cliCommand;

  return { cli: cliCommand, cmd, installCommand: provider?.installCommand };
}
