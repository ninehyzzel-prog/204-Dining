let bgmDraft = 'assets/audio/bgm.mp3';
let bgmBusy = false;
let bgmSettingsLoaded = false;
async function audioResponse(res) {
  if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('음성 관리 API를 사용할 수 없습니다. 메뉴 서버를 재시작해주세요.');
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '요청 실패');
  return result;
}
function updateNarrationPreview() {
  const audio = document.getElementById('narration-preview');
  audio.pause(); audio.src = uploadedNarration;
  document.getElementById('current-audio-label').textContent = uploadedNarration;
  document.getElementById('narration-status').textContent = '미리듣기 후 아래 메뉴 저장 버튼을 눌러 적용하세요.';
}
function resetNarrationDraft() {
  if (audioUploading || !dishes[selectedIndex]) return;
  uploadedNarration = `assets/audio/dish_${dishes[selectedIndex].id}.mp3`;
  updateNarrationPreview();
}
function updateBgmPreviewVolume() {
  const value = Number(document.getElementById('bgm-volume').value);
  document.getElementById('bgm-volume-label').textContent = value + '%';
  document.getElementById('bgm-preview').volume = value / 100;
}
function updateBgmPreview() {
  const audio = document.getElementById('bgm-preview');
  audio.pause(); audio.src = bgmDraft;
  document.getElementById('bgm-path').textContent = bgmDraft;
  updateBgmPreviewVolume();
}
function resetBgmDraft() {
  if (bgmBusy) return;
  bgmDraft = 'assets/audio/bgm.mp3'; updateBgmPreview();
  document.getElementById('bgm-status').textContent = '기본 음악을 선택했습니다. 설정 저장을 눌러 적용하세요.';
}
async function loadBgmSettings() {
  bgmBusy = true;
  try {
    const settings = await audioResponse(await fetch('/api/audio-settings'));
    bgmDraft = settings.bgm;
    document.getElementById('bgm-enabled').checked = settings.bgmEnabled;
    document.getElementById('bgm-volume').value = Math.round(settings.bgmVolume * 100);
    bgmSettingsLoaded = true; updateBgmPreview();
  } catch (e) { document.getElementById('bgm-status').textContent = e.message; }
  finally { bgmBusy = false; }
}
async function uploadManagedAudio(input, kind) {
  const bgm = kind === 'bgm';
  if (bgm ? bgmBusy : audioUploading) return;
  const file = input.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const status = document.getElementById(bgm ? 'bgm-status' : 'narration-status');
  if (!['mp3','wav','m4a','ogg'].includes(ext) || file.size > 50 * 1024 * 1024) { status.textContent = '50MB 이하 MP3, WAV, M4A, OGG 파일을 선택하세요.'; input.value = ''; return; }
  if (bgm) bgmBusy = true; else audioUploading = true;
  input.disabled = true; status.textContent = '음성 파일 업로드 중…';
  try {
    const result = await audioResponse(await fetch('/api/upload-audio?ext=' + ext, {method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:file}));
    if (bgm) { bgmDraft = result.path; updateBgmPreview(); }
    else { uploadedNarration = result.path; updateNarrationPreview(); }
    status.textContent = bgm ? '업로드 완료. 배경음악 설정 저장을 눌러 적용하세요.' : '업로드 완료. 아래 메뉴 저장 버튼을 눌러 적용하세요.';
  } catch (e) { status.textContent = e.message; }
  finally { if (bgm) bgmBusy = false; else audioUploading = false; input.disabled = false; input.value = ''; }
}
async function saveBgmSettings() {
  if (bgmBusy || !bgmSettingsLoaded) return;
  bgmBusy = true;
  const button = document.getElementById('bgm-save'); button.disabled = true;
  const status = document.getElementById('bgm-status');
  try {
    await audioResponse(await fetch('/api/audio-settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({bgm:bgmDraft, bgmEnabled:document.getElementById('bgm-enabled').checked, bgmVolume:Number(document.getElementById('bgm-volume').value)/100})}));
    status.textContent = '저장했습니다. 손님 메뉴판을 새로고침하면 반영됩니다.';
  } catch (e) { status.textContent = e.message; }
  finally { bgmBusy = false; button.disabled = false; }
}
for (const id of ['bgm-preview','narration-preview']) {
  const audio = document.getElementById(id);
  audio.addEventListener('play', () => document.getElementById(id === 'bgm-preview' ? 'narration-preview' : 'bgm-preview').pause());
  audio.addEventListener('error', () => { document.getElementById(id === 'bgm-preview' ? 'bgm-status' : 'narration-status').textContent = '이 파일을 재생할 수 없습니다. MP3 파일로 다시 시도해주세요.'; });
}
