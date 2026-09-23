const $ = (selector) => document.querySelector(selector);
let screenId = null;
let analysis = null;
let activeFilter = 'all';
let selectedId = null;

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
    const upload = await fetch('/api/screens', { method: 'POST', body: data }).then(readResponse);
    screenId = upload.screen_id;
    $('#workspace').classList.remove('hidden'); $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#screen-image').src = `/api/screens/${screenId}/image`;
    $('#canvas-loading').classList.remove('hidden'); button.innerHTML = 'Analyzing…';
    analysis = await fetch(`/api/screens/${screenId}/analyze`, { method: 'POST' }).then(readResponse);
    renderAnalysis();
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
    const box = document.createElement('div'); box.className = `box ${element.interactive ? '' : 'region'} ${element.confidence < .7 ? 'low' : ''} ${selectedId === element.id ? 'selected' : ''}`;
    box.style.left = `${element.bbox.x1*100}%`; box.style.top = `${element.bbox.y1*100}%`; box.style.width = `${(element.bbox.x2-element.bbox.x1)*100}%`; box.style.height = `${(element.bbox.y2-element.bbox.y1)*100}%`;
    box.title = `${element.type}${element.text ? ` · ${element.text}` : ''} · ${Math.round(element.confidence*100)}%`;
    if (element.text) { const label = document.createElement('span'); label.className = 'box-label'; label.textContent = element.text.slice(0, 22); box.appendChild(label); }
    box.onmouseenter = () => highlight(element.id); box.onclick = () => { selectedId = element.id; renderBoxes(); renderElements(); };
    overlay.appendChild(box);
  });
}
function renderElements() {
  const list = $('#element-list'); list.innerHTML = ''; $('#element-filter-label').textContent = activeFilter.toUpperCase();
  visibleElements().slice(0, 80).forEach(element => {
    const row = document.createElement('div'); row.className = `element-row ${element.confidence < .7 ? 'low' : ''} ${selectedId === element.id ? 'active' : ''}`;
    row.innerHTML = `<i class="element-marker"></i><div class="element-info"><b>${escapeHtml(element.text || titleCase(element.type))}</b><span>${element.id} · ${element.state} · ${element.interactive ? element.possible_actions.join(', ') : 'non-interactive'}</span></div><span class="element-confidence">${Math.round(element.confidence*100)}%</span>`;
    row.onmouseenter = () => highlight(element.id); row.onclick = () => { selectedId = element.id; renderBoxes(); renderElements(); };
    list.appendChild(row);
  });
  if (!list.children.length) list.innerHTML = '<div class="empty">No elements match this filter.</div>';
}
function highlight(id) { selectedId = id; document.querySelectorAll('.box').forEach(box => box.classList.remove('selected')); const index = visibleElements().findIndex(e => e.id === id); const box = document.querySelectorAll('.box')[index]; if (box) box.classList.add('selected'); document.querySelectorAll('.element-row').forEach(row => row.classList.remove('active')); const element = analysis.elements.find(e => e.id === id); if (element) [...document.querySelectorAll('.element-row')].find(row => row.textContent.includes(element.id))?.classList.add('active'); }
function renderPipeline() { const list = $('#pipeline-list'); list.innerHTML = ''; let total = 0; analysis.pipeline.forEach(stage => { total += stage.duration_ms; const row = document.createElement('div'); row.className = 'pipeline-row'; row.innerHTML = `<b>${stage.name}</b><span>${stage.duration_ms.toFixed(0)} ms</span><em class="${stage.status === 'unavailable' ? 'unavailable' : ''}">${stage.status}</em>`; list.appendChild(row); }); $('#total-latency').textContent = `${total.toFixed(0)} ms`; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
document.querySelectorAll('.tool').forEach(tool => tool.onclick = () => { document.querySelectorAll('.tool').forEach(t => t.classList.remove('active')); tool.classList.add('active'); activeFilter = tool.dataset.filter; if (analysis) { renderBoxes(); renderElements(); } });
$('#json-btn').onclick = () => { if (!analysis) return; const blob = new Blob([JSON.stringify(analysis, null, 2)], {type:'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${analysis.screen_id}-representation.json`; link.click(); URL.revokeObjectURL(link.href); };
$('#delete-btn').onclick = async () => { if (!screenId) return; await fetch(`/api/screens/${screenId}`, {method:'DELETE'}); location.reload(); };
