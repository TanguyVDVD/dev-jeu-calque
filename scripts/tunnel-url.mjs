// Prints the address of the quick tunnel, read from cloudflared's logs. It changes at every start.
import { execSync } from 'node:child_process';

for (let i = 0; i < 30; i++) {
  let logs = '';
  try { logs = execSync('docker compose --profile quick logs --no-color cloudflared-quick', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { logs = String(e.stdout ?? ''); }
  const urls = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  if (urls) { console.log(urls.at(-1)); process.exit(0); }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error('No trycloudflare.com address in the logs. Is the quick profile running?  docker compose --profile quick up -d --build');
process.exit(1);
