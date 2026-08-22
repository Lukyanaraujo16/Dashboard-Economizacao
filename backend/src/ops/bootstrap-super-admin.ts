import { createInterface } from 'node:readline';

import { loadEnvironment } from '../config/env.js';
import { loadRootEnvFile } from '../config/load-env-file.js';
import { getPrismaClient } from '../infrastructure/database/prisma.js';
import { createArgon2idPasswordHasher } from '../modules/auth/crypto/password-hasher.js';
import { createUserCredentialRepository } from '../modules/auth/repositories/user-credential.repository.js';
import { createUserRepository } from '../modules/auth/repositories/user.repository.js';
import {
  BootstrapSuperAdminError,
  createBootstrapSuperAdminService,
  formatBootstrapSuperAdminMessage,
} from '../modules/auth/services/bootstrap-super-admin.service.js';

type CliArgs = {
  readonly name: string;
  readonly email: string;
};

function parseArgs(argv: readonly string[]): CliArgs {
  let name = '';
  let email = '';

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }
    if (token === '--password' || token.startsWith('--password=')) {
      throw new BootstrapSuperAdminError(
        'BOOTSTRAP_PASSWORD_ARGV_FORBIDDEN',
        'Não informe a senha como argumento. Use stdin (a senha não deve ir para o histórico do shell).',
      );
    }
    const next = argv[index + 1];
    if (token === '--name' && next) {
      name = next;
      index += 1;
      continue;
    }
    if (token === '--email' && next) {
      email = next;
      index += 1;
    }
  }

  if (!name || !email) {
    throw new BootstrapSuperAdminError(
      'BOOTSTRAP_USAGE',
      'Uso: bootstrap-super-admin --name <nome> --email <email> (senha via stdin).',
    );
  }

  return { name, email };
}

async function readPasswordFromStdin(): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, terminal: false });
    try {
      const password = await new Promise<string>((resolve) => {
        rl.once('line', (line) => resolve(line));
      });
      return password.replace(/\r$/, '');
    } finally {
      rl.close();
    }
  }

  process.stderr.write('Senha do Super Administrador (não será exibida): ');
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let password = '';
    const onData = (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const char of text) {
        if (char === '\n' || char === '\r') {
          cleanup();
          process.stderr.write('\n');
          resolve(password);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          process.stderr.write('\n');
          reject(new BootstrapSuperAdminError('BOOTSTRAP_CANCELLED', 'Bootstrap cancelado.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          password = password.slice(0, -1);
          continue;
        }
        if (char === '\u0015') {
          password = '';
          continue;
        }
        if (char < ' ') {
          continue;
        }
        password += char;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  loadRootEnvFile();
  loadEnvironment();

  const args = parseArgs(process.argv.slice(2));
  const password = await readPasswordFromStdin();
  if (password.length === 0) {
    throw new BootstrapSuperAdminError('BOOTSTRAP_PASSWORD_REQUIRED', 'Senha não informada.');
  }

  const prisma = getPrismaClient();
  const service = createBootstrapSuperAdminService({
    users: createUserRepository(prisma),
    credentials: createUserCredentialRepository(prisma),
    passwordHasher: createArgon2idPasswordHasher(),
  });

  const result = await service.bootstrap({
    name: args.name,
    email: args.email,
    password,
  });

  process.stdout.write(`${formatBootstrapSuperAdminMessage(result)}\n`);
}

try {
  await main();
} catch (error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Falha ao executar bootstrap de SUPER_ADMIN.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
