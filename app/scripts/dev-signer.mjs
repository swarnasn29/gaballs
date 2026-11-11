// `npm run dev:signer`: starts `next dev` bound to 127.0.0.1 only, with GABALLS_DEV_SIGNER_LOCAL=1 so next.config.ts
// may enable the dev test signer (if DEV_SIGNER=1 is also set). Plain `npm run dev` never sets this flag.
import { spawn } from 'node:child_process';

const child = spawn('npx', ['next', 'dev', '-H', '127.0.0.1', '-p', process.env.PORT ?? '3000'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GABALLS_DEV_SIGNER_LOCAL: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
