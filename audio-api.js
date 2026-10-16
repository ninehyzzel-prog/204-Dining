const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const defaults = { bgm: 'assets/audio/bgm.mp3', bgmEnabled: true, bgmVolume: 0.16 };
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) { failed = true; chunks = []; reject(Object.assign(new Error('파일 또는 요청 용량이 너무 큽니다.'), {status:413})); }
      else chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('업로드가 중단되었습니다.')));
  });
}
module.exports = function audioApi(req, res, url, root) {
  if (!['/api/audio-settings', '/api/upload-audio'].includes(url.pathname)) return false;
  const send = (status, data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
  (async () => {
    const settingsFile = path.join(root, 'audio-settings.json');
    if (url.pathname === '/api/audio-settings') {
      if (req.method === 'GET') {
        let settings = defaults;
        try { settings = {...defaults, ...JSON.parse(await fs.promises.readFile(settingsFile, 'utf8'))}; }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        send(200, settings); return;
      }
      if (req.method !== 'POST') { send(405, {error:'지원하지 않는 요청입니다.'}); return; }
      const data = JSON.parse((await readBody(req, 8192)).toString());
      if (typeof data.bgmEnabled !== 'boolean' || typeof data.bgmVolume !== 'number' || !Number.isFinite(data.bgmVolume) || data.bgmVolume < 0 || data.bgmVolume > 1 ||
          typeof data.bgm !== 'string' || !/^assets\/audio\/[a-zA-Z0-9_-]+\.(mp3|wav|m4a|ogg)$/i.test(data.bgm)) {
        send(400, {error:'배경음악 설정이 올바르지 않습니다.'}); return;
      }
      await fs.promises.access(path.join(root, data.bgm));
      const settings = {bgm:data.bgm, bgmEnabled:data.bgmEnabled, bgmVolume:data.bgmVolume};
      const temporary = settingsFile + '.' + randomUUID() + '.tmp';
      await fs.promises.writeFile(temporary, JSON.stringify(settings, null, 2));
      await fs.promises.rename(temporary, settingsFile);
      send(200, {success:true, ...settings}); return;
    }
    if (req.method !== 'POST') { send(405, {error:'지원하지 않는 요청입니다.'}); return; }
    const ext = (url.searchParams.get('ext') || '').toLowerCase();
    if (!['mp3','wav','m4a','ogg'].includes(ext)) { req.resume(); send(400, {error:'MP3, WAV, M4A, OGG 파일을 선택하세요.'}); return; }
    const data = await readBody(req, 50 * 1024 * 1024);
    const ascii = (start,end) => data.toString('ascii',start,end);
    const valid = data.length >= 12 && (
      ext === 'mp3' && (ascii(0,3) === 'ID3' || data[0] === 255 && (data[1] & 224) === 224) ||
      ext === 'wav' && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WAVE' ||
      ext === 'm4a' && ascii(4,8) === 'ftyp' || ext === 'ogg' && ascii(0,4) === 'OggS');
    if (!valid) { send(400, {error:'파일 형식과 내용이 일치하지 않습니다. 다른 음성 파일을 선택하세요.'}); return; }
    const name = randomUUID() + '.' + ext;
    await fs.promises.mkdir(path.join(root,'assets','audio'), {recursive:true});
    await fs.promises.writeFile(path.join(root,'assets','audio',name), data, {flag:'wx'});
    send(200, {success:true, path:'assets/audio/' + name});
  })().catch(error => send(error.status || (error instanceof SyntaxError ? 400 : 500), {error:error.status ? error.message : '음악 파일 또는 설정 처리에 실패했습니다.'}));
  return true;
};
