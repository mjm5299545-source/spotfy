import { spawnSync } from 'node:child_process';
import process from 'node:process';

const transient = /network timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|audit endpoint returned an error/i;
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = spawnSync('npm', [
    'audit', '--audit-level=moderate', '--fetch-retries=0', '--fetch-timeout=15000',
  ], { encoding: 'utf8', timeout: 25000 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status === 0) {
    process.stdout.write(output);
    process.exit(0);
  }
  if (!transient.test(output)) {
    process.stderr.write(output || String(result.error ?? 'npm audit falhou sem detalhes.'));
    process.exit(1);
  }
  process.stderr.write(`npm audit: falha temporária de rede (tentativa ${attempt}/3).\n`);
}

process.stdout.write('::warning::Auditoria de dependências não pôde consultar o registro npm após três tentativas. A verificação de vulnerabilidades deve ser repetida quando o serviço voltar.\n');
