const $ = (selector) => document.querySelector(selector);
let screenId = null;
let analysis = null;
let activeFilter = 'all';
let selectedId = null;
let selectedIds = [];
let hostedMode = false;

async function boot() {
  try {
    const health = await fetch('/api/health').then(r => r.json());
    $('#provider-status').textContent = `local detector · ${health.providers.ocr === 'unavailable' ? 'OCR unavailable' : 'OCR ready'}`;
    if (health.providers.ocr === 'unavailable') $('#provider-status').style.color = '#d88936';
  } catch { $('#provider-status').textContent = 'backend unavailable'; }
}
boot();

function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800); }
function selectFile(file) {
  if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return showToast('Please choose a PNG, JPG, or WEBP screenshot.');
  $('#file-name').textContent = file.name;
  $('#file-size').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · ready to analyze`;
  $('#drop-zone').classList.add('hidden'); $('#selected-file').classList.remove('hidden');
  $('#analyze-btn').dataset.file = 'ready'; window.selectedFile = file;
}
$('#choose-btn').onclick = () => $('#file-input').click();
$('#hero-choose').onclick = () => $('#file-input').click();
$('#file-input').onchange = e => selectFile(e.target.files[0]);
const drop = $('#drop-zone');
['dragenter','dragover'].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.style.borderColor = '#35bd7b'; }));
['dragleave','drop'].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.style.borderColor = ''; }));
drop.addEventListener('drop', e => selectFile(e.dataTransfer.files[0]));

$('#analyze-btn').onclick = async () => {
  if (!window.selectedFile) return;
  const button = $('#analyze-btn'); button.disabled = true; button.innerHTML = 'Uploading…';
  const data = new FormData(); data.append('file', window.selectedFile);
  try {
    let upload;
    try { upload = await fetch('/api/screens', { method: 'POST', body: data }).then(readResponse); }
    catch { hostedMode = true; screenId = `browser-${Date.now()}`; }
    if (!hostedMode) screenId = upload.screen_id;
    $('#workspace').classList.remove('hidden'); $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#screen-image').src = hostedMode ? URL.createObjectURL(window.selectedFile) : `/api/screens/${screenId}/image`;
    $('#canvas-loading').classList.remove('hidden'); button.innerHTML = 'Analyzing…';
    analysis = hostedMode ? await browserAnalyze(window.selectedFile) : await fetch(`/api/screens/${screenId}/analyze`, { method: 'POST' }).then(readResponse);
    renderAnalysis(); $('#qa-panel').classList.remove('hidden');
  } catch (error) { showToast(error.message); } finally { button.disabled = false; button.innerHTML = 'Analyze screen <span>↗</span>'; $('#canvas-loading').classList.add('hidden'); }
};

async function readResponse(response) { const body = await response.json(); if (!response.ok) throw new Error(body.detail || 'Request failed'); return body; }
function renderAnalysis() {
  $('#canvas-dimensions').textContent = `${analysis.width} × ${analysis.height}px`;
  $('#screen-type').textContent = titleCase(analysis.screen_type);
  $('#description').textContent = analysis.description;
  $('#element-count').textContent = analysis.elements.length;
  $('#interactive-count').textContent = analysis.elements.filter(e => e.interactive).length;
  $('#ocr-count').textContent = analysis.text_regions.length;
  renderBoxes(); renderElements(); renderPipeline();
}
function titleCase(value) { return value.replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase()); }
function visibleElements() { return analysis.elements.filter(e => activeFilter === 'all' || (activeFilter === 'interactive' && e.interactive) || (activeFilter === 'text' && e.text) || (activeFilter === 'low' && e.confidence < .7)); }
function renderBoxes() {
  const overlay = $('#overlay'); overlay.innerHTML = '';
  visibleElements().forEach(element => {
    const box = document.createElement('div'); box.className = `box ${element.interactive ? '' : 'region'} ${element.confidence < .7 ? 'low' : ''} ${selectedIds.includes(element.id) || selectedId === element.id ? 'selected' : ''}`;
    box.style.left = `${element.bbox.x1*100}%`; box.style.top = `${element.bbox.y1*100}%`; box.style.width = `${(element.bbox.x2-element.bbox.x1)*100}%`; box.style.height = `${(element.bbox.y2-element.bbox.y1)*100}%`;
    box.title = `${element.type}${element.text ? ` · ${element.text}` : ''} · ${Math.round(element.confidence*100)}%`;
    if (element.text) { const label = document.createElement('span'); label.className = 'box-label'; label.textContent = element.text.slice(0, 22); box.appendChild(label); }
    box.onmouseenter = () => highlight(element.id); box.onclick = () => { selectedId = element.id; selectedIds = [element.id]; renderBoxes(); renderElements(); };
    overlay.appendChild(box);
  });
}
function renderElements() {
  const list = $('#element-list'); list.innerHTML = ''; $('#element-filter-label').textContent = activeFilter.toUpperCase();
  visibleElements().slice(0, 80).forEach(element => {
    const row = document.createElement('div'); row.className = `element-row ${element.confidence < .7 ? 'low' : ''} ${selectedId === element.id ? 'active' : ''}`;
    row.innerHTML = `<i class="element-marker"></i><div class="element-info"><b>${escapeHtml(element.text || titleCase(element.type))}</b><span>${element.id} · ${element.state} · ${element.interactive ? element.possible_actions.join(', ') : 'non-interactive'}</span></div><span class="element-confidence">${Math.round(element.confidence*100)}%</span>`;
    row.onmouseenter = () => highlight(element.id); row.onclick = () => { selectedId = element.id; selectedIds = [element.id]; renderBoxes(); renderElements(); };
    list.appendChild(row);
  });
  if (!list.children.length) list.innerHTML = '<div class="empty">No elements match this filter.</div>';
}
function highlight(id) { selectedId = id; selectedIds = [id]; document.querySelectorAll('.box').forEach(box => box.classList.remove('selected')); const index = visibleElements().findIndex(e => e.id === id); const box = document.querySelectorAll('.box')[index]; if (box) box.classList.add('selected'); document.querySelectorAll('.element-row').forEach(row => row.classList.remove('active')); const element = analysis.elements.find(e => e.id === id); if (element) [...document.querySelectorAll('.element-row')].find(row => row.textContent.includes(element.id))?.classList.add('active'); }
function renderPipeline() { const list = $('#pipeline-list'); list.innerHTML = ''; let total = 0; analysis.pipeline.forEach(stage => { total += stage.duration_ms; const row = document.createElement('div'); row.className = 'pipeline-row'; row.innerHTML = `<b>${stage.name}</b><span>${stage.duration_ms.toFixed(0)} ms</span><em class="${stage.status === 'unavailable' ? 'unavailable' : ''}">${stage.status}</em>`; list.appendChild(row); }); $('#total-latency').textContent = `${total.toFixed(0)} ms`; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
document.querySelectorAll('.tool').forEach(tool => tool.onclick = () => { document.querySelectorAll('.tool').forEach(t => t.classList.remove('active')); tool.classList.add('active'); activeFilter = tool.dataset.filter; if (analysis) { renderBoxes(); renderElements(); } });
$('#json-btn').onclick = () => { if (!analysis) return; const blob = new Blob([JSON.stringify(analysis, null, 2)], {type:'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${analysis.screen_id}-representation.json`; link.click(); URL.revokeObjectURL(link.href); };
$('#delete-btn').onclick = async () => { if (!screenId) return; await fetch(`/api/screens/${screenId}`, {method:'DELETE'}); location.reload(); };
$('#ask-btn').onclick = askQuestion;
$('#question-input').onkeydown = event => { if (event.key === 'Enter') askQuestion(); };
async function askQuestion() {
  const question = $('#question-input').value.trim();
  if (!question || !screenId) return;
  const button = $('#ask-btn'); button.disabled = true; button.textContent = 'Grounding…';
  try {
    const result = hostedMode ? browserAnswer(analysis, question) : await fetch(`/api/screens/${screenId}/query`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question})}).then(readResponse);
    $('#answer-card').classList.remove('hidden'); $('#answer-text').textContent = result.answer; $('#answer-confidence').textContent = `${Math.round(result.confidence*100)}% confidence`;
    $('#answer-evidence').textContent = result.evidence.join(' · ');
    if (result.element_id) { selectedId = result.element_id; selectedIds = result.element_ids?.length ? result.element_ids : [result.element_id]; renderBoxes(); renderElements(); document.getElementById('overlay').scrollIntoView({behavior:'smooth', block:'center'}); }
  } catch (error) { showToast(error.message); } finally { button.disabled = false; button.innerHTML = 'Ask question <span>↗</span>'; }
}

async function browserAnalyze(file) {
  if (!window.Tesseract) throw new Error('Browser OCR library failed to load. Refresh and try again.');
  const result = await Tesseract.recognize(file, 'eng', { logger: message => { if (message.status === 'recognizing text') $('#provider-status').textContent = `browser OCR · ${Math.round((message.progress || 0)*100)}%`; } });
  const image = await loadImage(file); const width = image.naturalWidth, height = image.naturalHeight;
  const words = (result.data.words || []).filter(word => word.text.trim() && word.confidence > 15);
  const textRegions = words.map(word => ({text: word.text.trim(), confidence: Math.max(0, Math.min(1, word.confidence / 100)), bbox: {x1: word.bbox.x0/width, y1: word.bbox.y0/height, x2: word.bbox.x1/width, y2: word.bbox.y1/height}}));
  const actionWords = /log.?in|sign.?in|search|submit|checkout|buy|order|save|send|continue|next|back|close|menu|follow|post|add/i;
  const elements = textRegions.map((region, index) => { const interactive = actionWords.test(region.text); return {id:`element_${String(index+1).padStart(3,'0')}`, type:interactive ? 'button' : 'text', bbox:region.bbox, confidence:Math.round((interactive ? Math.min(.86, region.confidence+.18) : region.confidence)*100)/100, text:region.text, interactive, state:interactive ? 'enabled' : 'unknown', possible_actions:interactive ? ['click'] : [], source:'browser_tesseract'}; });
  $('#provider-status').textContent = 'browser OCR · local image processing';
  return {screen_id:screenId, filename:file.name, width, height, screen_type:'unknown', description:'Browser-local OCR and text-affordance analysis. Use the local FastAPI mode for the OpenCV baseline.', elements, text_regions:textRegions, relationships:[], current_state:{interactive_elements:elements.filter(e=>e.interactive).length, ocr_regions:textRegions.length}, available_actions:['click','type','scroll'], pipeline:[{name:'Browser OCR',status:'complete',duration_ms:0,detail:'Tesseract.js in browser'},{name:'Text affordance detector',status:'complete',duration_ms:0,detail:'Action-label heuristic'}], providers:{detector:'browser_text_affordance',ocr:'tesseract.js'}};
}
function loadImage(file) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = URL.createObjectURL(file); }); }
function browserAnswer(screen, question) {
  const tokens = question.toLowerCase().match(/[a-z0-9-]+/g) || [];
  const typeQuery = tokens.includes('button') || tokens.includes('buttons');
  const matches = typeQuery ? screen.elements.filter(element => element.type === 'button') : screen.elements.filter(element => tokens.some(token => element.text.toLowerCase().includes(token)));
  if (!matches.length) return {answer:"I couldn't ground that question to readable text or an action label in this screenshot.", confidence:.25, evidence:['Browser-local grounding found no matching OCR region.'], element_ids:[], bboxes:[]};
  const shown = matches.slice(0, 6).map(element => `“${element.text}”`).join(', ');
  return {answer:typeQuery ? `Yes — I can see ${matches.length} button${matches.length === 1 ? '' : 's'}: ${shown}.` : `The closest readable match is “${matches[0].text}”.`, confidence:Math.min(.9, .55 + matches[0].confidence*.35), element_id:matches[0].id, bbox:matches[0].bbox, element_ids:matches.map(element=>element.id), bboxes:matches.map(element=>element.bbox), evidence:[`Matched ${matches.length} browser OCR element(s).` ]};
}
