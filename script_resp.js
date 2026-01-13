document.addEventListener('DOMContentLoaded', () => {
  // Realtime date/time updater
  const dateEl = document.getElementById('date-value');
  const timeEl = document.getElementById('time-value');

  function formatDate(d){
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}.${mm}.${dd}`;
  }

  function formatTime(d){
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2,'0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if(h === 0) h = 12;
    return `${h}:${m}${ampm}`;
  }

  function updateDateTime(){
    const now = new Date();
    if(dateEl) dateEl.textContent = formatDate(now);
    if(timeEl) timeEl.textContent = formatTime(now);
  }

  updateDateTime();
  // update every second so minutes/AM/PM switch instantly
  setInterval(updateDateTime, 1000);

  const buttons = document.querySelectorAll('.fo-btn');
  const placeholder = document.getElementById('upload-placeholder');
  const foDetails = document.getElementById('fo-details');
  const selectedNameSpan = document.getElementById('selected-name');
  const input = document.getElementById('photo-input');
  const preview = document.getElementById('preview');

  if(!buttons || buttons.length===0) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const name = btn.textContent.trim();
      if (selectedNameSpan) selectedNameSpan.textContent = name;
      if (placeholder) placeholder.style.display = 'none';
      if (foDetails) foDetails.classList.remove('hidden');
      if (preview) preview.innerHTML = '';
      // Save upload record to local server DB, then open the link in a new tab.
      const url = (btn && btn.dataset && btn.dataset.url) ? btn.dataset.url : null;
      const record = { name, timestamp: new Date().toISOString() };

      // Use navigator.sendBeacon if available (best for firing during navigations)
      const payload = JSON.stringify(record);
      const savedAndOpen = () => {
        if (url) {
          try { window.open(url, '_blank'); } catch (err) { window.location.href = url; }
        }
      };

      try {
        // Use fetch with keepalive to reliably POST the record (works with Express JSON parser)
        fetch('/api/uploads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: payload, keepalive: true })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) addRecent(data); else addRecent(record); savedAndOpen(); })
          .catch(err => { console.warn('save failed', err); addRecent(record); savedAndOpen(); });
      } catch (e) {
        console.warn('upload save error', e);
        addRecent(record);
        savedAndOpen();
      }
    });
  });

  if (input) {
    input.addEventListener('change', (e) => {
      if (preview) preview.innerHTML = '';
      const files = Array.from(e.target.files || []);
      files.forEach(file => {
        if(!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (!preview) return;
          const wrap = document.createElement('div');
          wrap.className = 'thumb';
          const img = document.createElement('img');
          img.src = ev.target.result;
          wrap.appendChild(img);
          preview.appendChild(wrap);
        };
        reader.readAsDataURL(file);
      });
    });
  }

  // No popup handlers required after reverting modal behavior.
  // Recent uploads: load and render
  const recentContainer = document.getElementById('recent-uploads');
  let lastSeenId = null;
  function renderRecent(items){
    if(!recentContainer) return;
    recentContainer.innerHTML = '';
    if(!items || items.length === 0){
      const el = document.createElement('div'); el.className = 'empty'; el.textContent = 'coming soon Recent uploads feature';
      recentContainer.appendChild(el); return;
    }
    items.forEach(it => {
      const r = document.createElement('div'); r.className = 'item';
      if (it.id) r.dataset.id = it.id;
      const left = document.createElement('div'); left.className='name'; left.textContent = it.name;
      const right = document.createElement('div'); right.className='time';
      const dt = new Date(it.timestamp);
      right.textContent = dt.toLocaleString();
      r.appendChild(left); r.appendChild(right);
        // actions
        const actions = document.createElement('div'); actions.className = 'recent-item-actions';
        const viewBtn = document.createElement('button'); viewBtn.textContent = 'View';
        const dlBtn = document.createElement('button'); dlBtn.textContent = 'Download';
        const delBtn = document.createElement('button'); delBtn.textContent = 'Delete';
        actions.appendChild(viewBtn); actions.appendChild(dlBtn); actions.appendChild(delBtn);
        r.appendChild(actions);

        // handlers
        if (viewBtn) viewBtn.addEventListener('click', () => {
          // open single-record view in new tab
          window.open(`/api/uploads/${it.id}`, '_blank');
        });
        if (dlBtn) dlBtn.addEventListener('click', () => {
          window.open(`/api/uploads/${it.id}?download=1`, '_blank');
        });
        if (delBtn) delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this record?')) return;
          try{
            const res = await fetch(`/api/uploads/${it.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            // remove from UI
            if (r && r.parentNode) r.parentNode.removeChild(r);
          }catch(e){ alert('Delete failed'); }
        });
      recentContainer.appendChild(r);
    });
  }

  async function loadRecent(){
    try{
      const res = await fetch('/api/uploads' + (includeOld ? '?include_all=1' : ''));
      if(!res.ok) throw new Error('failed');
      const items = await res.json();
      renderRecent(items);
      if (items && items.length>0) lastSeenId = items[0].id || lastSeenId;
    }catch(e){ console.warn('failed to load recent', e); renderRecent([]); }
  }

  function addRecent(entry){
    // optimistic prepend
    const existing = recentContainer.querySelector('.empty');
    if(existing) existing.remove();
    // if entry has an id and it's already shown, skip
    if (entry && entry.id) {
      if (recentContainer.querySelector(`[data-id="${entry.id}"]`)) return;
    }
    const r = document.createElement('div'); r.className = 'item';
    if (entry && entry.id) r.dataset.id = entry.id;
    const left = document.createElement('div'); left.className='name'; left.textContent = entry.name;
    const right = document.createElement('div'); right.className='time'; right.textContent = new Date(entry.timestamp).toLocaleString();
    r.appendChild(left); r.appendChild(right);
    if (recentContainer.firstChild) recentContainer.insertBefore(r, recentContainer.firstChild);
    else recentContainer.appendChild(r);
  }

  // Poll for updates every 5 seconds and update UI when new uploads appear
  async function pollRecent(){
    try{
      const res = await fetch('/api/uploads');
      if(!res.ok) return;
      const items = await res.json();
      if(!items || items.length===0) return;
      const newest = items[0];
      // if we haven't seen anything yet, seed lastSeenId and render
      if (!lastSeenId) {
        renderRecent(items);
        lastSeenId = newest.id || lastSeenId;
        return;
      }
      if (newest.id && newest.id !== lastSeenId) {
        // find items that are newer than lastSeenId (ids are numeric timestamps)
        const newItems = items.filter(it => it.id && (!lastSeenId || it.id > lastSeenId));
        // add them in chronological order (oldest first)
        newItems.reverse().forEach(it => addRecent(it));
        lastSeenId = items[0].id || lastSeenId;
      }
    }catch(e){ /* ignore polling errors */ }
  }

  // toolbar controls
  let includeOld = false;
  const toggle = document.getElementById('toggle-include-old');
  const clearBtn = document.getElementById('clear-recent');
  if (toggle) toggle.addEventListener('change', (e) => { includeOld = e.target.checked; loadRecent(); });
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear all recent uploads? This will remove entries from uploads.json.')) return;
    try{
      // fetch current items (respect includeOld)
      const res = await fetch('/api/uploads' + (includeOld ? '?include_all=1' : ''));
      if (!res.ok) throw new Error('failed');
      const items = await res.json();
      // delete each one
      await Promise.all(items.map(it => fetch(`/api/uploads/${it.id}`, { method: 'DELETE' })));
      loadRecent();
    }catch(e){ alert('Failed to clear'); }
  });

  loadRecent();
  setInterval(pollRecent, 5000);
});
