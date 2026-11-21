import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';

// Never inherit the application's database for integration tests.
const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const address = socket.address();
    socket.close(() => resolve(address.port));
  });
});
const databaseDir = await mkdtemp(join(process.env.ERP_TEST_TMPDIR || tmpdir(), 'erp-test-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir, port, user: 'postgres', password, persistent: false,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
});
let started = false;
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase('erp_test');
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/erp_test`;
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
      stdio: 'inherit',
      env: {
        ...process.env, NODE_ENV: 'test', DATABASE_URL: url, TEST_DATABASE_URL: url,
        SUPABASE_DB_URL: url, DB_SSL_REJECT_UNAUTHORIZED: 'false', MAIL_DISABLED: 'true',
        PREVIEW_LOGIN: '0', JWT_SECRET: randomBytes(32).toString('hex'),
      },
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  if (started) await postgres.stop();
}
