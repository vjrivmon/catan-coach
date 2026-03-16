const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');

const PORT = 9000;
const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh');
const BRANCH = 'refs/heads/master';

function verifySignature(payload, signature) {
  if (!SECRET) {
    console.warn('WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const expected = 'sha256=' + hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

let deploying = false;

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const signature = req.headers['x-hub-signature-256'];

    if (!verifySignature(body, signature)) {
      console.error('Invalid signature');
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body.toString());
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    if (payload.ref !== BRANCH) {
      console.log(`Ignoring push to ${payload.ref} (only ${BRANCH} triggers deploy)`);
      res.writeHead(200);
      res.end('Ignored — not target branch');
      return;
    }

    if (deploying) {
      console.log('Deploy already in progress, skipping');
      res.writeHead(202);
      res.end('Deploy already in progress');
      return;
    }

    console.log(`Deploy triggered by push from ${payload.pusher?.name || 'unknown'}`);
    deploying = true;

    res.writeHead(200);
    res.end('Deploy started');

    execFile('/bin/bash', [DEPLOY_SCRIPT], { cwd: __dirname }, (err, stdout, stderr) => {
      deploying = false;
      if (err) {
        console.error('Deploy failed:', err.message);
        console.error('stderr:', stderr);
      } else {
        console.log('Deploy succeeded');
        if (stdout) console.log(stdout);
      }
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Webhook server listening on 127.0.0.1:${PORT}`);
});
