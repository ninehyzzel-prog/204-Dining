const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

const PORT = 3000;
const ROOT_DIR = path.join(__dirname, '204_DINING_Landscape');
const ADMIN_PIN = "2040";

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  let bestIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
          return iface.address;
        }
        bestIp = iface.address;
      }
    }
  }
  return bestIp;
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  // The receiving device uses the same access rule as the admin page.
  if (req.method === 'GET' && pathname === '/api/orders') {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!local && req.headers['x-admin-pin'] !== ADMIN_PIN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '관리자 PIN을 확인해주세요.' }));
      return;
    }
    fs.readFile(path.join(__dirname, 'orders.json'), 'utf8', (error, data) => {
      try {
        if (error && error.code !== 'ENOENT') throw error;
        const orders = error ? [] : JSON.parse(data);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ orders: orders.slice(0, 100) }));
      } catch (_) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '주문 내역을 읽지 못했습니다.' }));
      }
    });
    return;
  }
  if (require('./audio-api')(req, res, parsedUrl, ROOT_DIR)) return;

  // Binary GLB upload: avoid base64 inflation for large models.
  if (req.method === 'POST' && pathname === '/api/upload-model') {
    const limit = 50 * 1024 * 1024;
    const chunks = [];
    let size = 0, rejected = false;
    const reject = (status, error) => {
      rejected = true;
      chunks.length = 0;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error }));
    };
    req.on('data', chunk => {
      if (rejected) return;
      size += chunk.length;
      if (size > limit) { reject(413, 'GLB 파일은 50MB 이하여야 합니다.'); return; }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      if (rejected) return;
      const buffer = Buffer.concat(chunks);
      try {
        if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF' ||
            buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length ||
            buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB header');
        const jsonLength = buffer.readUInt32LE(12);
        if (jsonLength > buffer.length - 20) throw new Error('Invalid GLB length');
        const document = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
        if (!document.asset || document.asset.version !== '2.0') throw new Error('Invalid glTF asset');
        if ([...(document.buffers || []), ...(document.images || [])].some(item => item.uri && !item.uri.startsWith('data:'))) {
          throw new Error('External files are not supported');
        }
      } catch (error) {
        reject(400, '텍스처가 포함된 유효한 GLB 2.0 파일을 선택하세요.');
        return;
      }
      try {
        const name = require('crypto').randomUUID() + '.glb';
        const dir = path.join(ROOT_DIR, 'assets', 'models');
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, name), buffer, { flag: 'wx' });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, path: `assets/models/${name}` }));
      } catch (error) { reject(500, '3D 파일 저장에 실패했습니다.'); }
    });
    return;
  }

  // 1. API: GET /api/dishes
  if (req.method === 'GET' && pathname === '/api/dishes') {
    const dishesPath = path.join(ROOT_DIR, 'dishes.json');
    fs.readFile(dishesPath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cannot read dishes.json' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // 2. API: POST /api/dishes
  if (req.method === 'POST' && pathname === '/api/dishes') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        const dishesPath = path.join(ROOT_DIR, 'dishes.json');
        fs.writeFile(dishesPath, JSON.stringify(json, null, 2), 'utf8', err => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to write dishes.json' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, count: json.length }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // 3. API: POST /api/upload (Base64 Image Upload)
  if (req.method === 'POST' && pathname === '/api/upload') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { filename, data } = JSON.parse(body);
        if (!data || !filename) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing filename or data' }));
          return;
        }

        const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const safeName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uploadDir = path.join(ROOT_DIR, 'assets', 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const savePath = path.join(uploadDir, safeName);
        fs.writeFile(savePath, buffer, err => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save image' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, path: `assets/uploads/${safeName}` }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid upload payload' }));
      }
    });
    return;
  }

  // 4. API: POST /api/generate-voice
  if (req.method === 'POST' && pathname === '/api/generate-voice') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, text } = JSON.parse(body);
        if (!id || !text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing id or text' }));
          return;
        }

        const scriptPath = path.join(__dirname, 'generate_voice.py');
        execFile('python', [scriptPath, '--id', String(id), '--text', text], (err, stdout, stderr) => {
          if (err) {
            console.error('Voice generation error:', err, stderr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Voice generation failed', details: stderr }));
            return;
          }
          const audioPath = `assets/audio/dish_${id}.mp3`;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, audioPath }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid voice request' }));
      }
    });
    return;
  }

  // 4. API: POST /api/order (Record dining order confirmation)
  if (req.method === 'POST' && pathname === '/api/order') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const orderData = JSON.parse(body);
        const orderId = orderData.orderId || ('204-' + Math.floor(100 + Math.random() * 900));
        const ordersFile = path.join(__dirname, 'orders.json');
        let orders = [];
        if (fs.existsSync(ordersFile)) {
          try { orders = JSON.parse(fs.readFileSync(ordersFile, 'utf8')); } catch(e) {}
        }
        const record = {
          notificationId: require('crypto').randomUUID(),
          orderId,
          timestamp: new Date().toISOString(),
          items: orderData.items || [],
          totalQty: orderData.totalQty || orderData.totalCount || 0,
          table: orderData.table || orderData.tableNo || 'A-3'
        };
        orders.unshift(record);
        fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2), 'utf8');
        console.log(`\n🛎️  [신규 주문 접수] ${orderId} (${record.items.length}종류 메뉴, 총 ${record.totalQty}개, 테이블 ${record.table})`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, orderId, timestamp: record.timestamp }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid order payload' }));
      }
    });
    return;
  }

  // 5. Admin Page Access Security
  if (pathname === '/admin' || pathname === '/admin.html') {
    const isLocal = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1';
    const pin = parsedUrl.searchParams.get('pin') || req.headers['x-admin-pin'];
    
    if (!isLocal && pin !== ADMIN_PIN) {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <title>204 DINING | Admin Lock</title>
          <style>
            body{background:#1c1715;color:#f4efe5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
            .card{background:#2b2220;padding:40px;border-radius:12px;text-align:center;max-width:360px;box-shadow:0 10px 40px rgba(0,0,0,0.5)}
            h2{color:#f4efe5;margin-top:0}
            input{width:100%;padding:14px;border:1px solid #70212b;background:#1c1715;color:#fff;border-radius:6px;font-size:20px;text-align:center;box-sizing:border-box;margin:20px 0}
            button{width:100%;padding:14px;background:#70212b;color:#fff;border:none;border-radius:6px;font-size:16px;cursor:pointer}
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✦ 204 DINING ✦</h2>
            <p style="color:#a89b91;font-size:14px">관리자 페이지 보안 접속<br>(아이패드 게스트 차단 모드)</p>
            <input type="password" id="pin" placeholder="관리자 PIN (기본 2040)" maxlength="6">
            <button onclick="check()">접속하기</button>
          </div>
          <script>
            function check(){
              const val = document.getElementById('pin').value;
              if(val === '2040'){
                location.href = '/admin.html?pin=' + val;
              } else {
                alert('비밀번호가 일치하지 않습니다.');
              }
            }
          </script>
        </body>
        </html>
      `);
      return;
    }
    pathname = '/admin.html';
  }

  // 6. Static File Serving with Range Support
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const filePath = path.join(ROOT_DIR, pathname);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;

    // HTTP 206 Partial Content
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        res.end();
        return;
      }

      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n⚠️  [3000번 포트 중복 알림]');
    console.error('   3000번 포트가 이미 사용 중입니다.');
    console.error('   백그라운드에서 이미 204 DINING 서버가 실행 중입니다!');
    console.error('   👉 브라우저 확인: http://localhost:3000\n');
    process.exit(1);
  } else {
    console.error('서버 오류:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n===============================================================');
  console.log('   ✦ 204 DINING — Private Fine Dining iPad Menu Server ✦');
  console.log('===============================================================');
  console.log(`  [PC 로컬 확인]:     http://localhost:${PORT}`);
  console.log(`  [PC 관리자 페이지]: http://localhost:${PORT}/admin`);
  console.log(`  [로컬 네트워크 IP]: http://${localIp}:${PORT}`);
  console.log('---------------------------------------------------------------');

  // Launch Cloudflare Quick Tunnel automatically if available
  const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');
  if (fs.existsSync(cloudflaredPath) && process.env.DISABLE_TUNNEL !== '1') {
    console.log('  🌐 Cloudflare 안전 터널 생성 중...');
    const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${PORT}`]);
    let urlFound = false;

    tunnel.stderr.on('data', data => {
      const str = data.toString();
      const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !urlFound) {
        urlFound = true;
        console.log('\n  👉 [아이패드 접속 주소 - 강력 추천 (어디서나 접속)]:');
        console.log(`     ${match[0]}`);
        console.log('  💡 위 주소는 HTTPS 보안 연결이 적용되어 아이패드 사파리에서');
        console.log('     음악/음성 자동재생 및 홈 화면 추가(전체화면)가 100% 지원됩니다!');
        console.log('===============================================================\n');
      }
    });

    process.on('exit', () => {
      tunnel.kill();
    });
  } else {
    console.log('===============================================================\n');
  }
});
