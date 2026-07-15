'use strict';

const STATUS_LABELS = {
  available: 'Available',
  'in-use': 'In use',
  'needs-supplies': 'Needs supplies',
};

const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
const PENCIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>';
const TRASH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

const state = {
  flipcharts: [],
  locations: [],
  search: '',
  locationFilter: '', // '' = all, 'none' = unassigned, otherwise location id
  statusFilter: '',
  editingId: null,
};

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

// ---------- API ----------

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function refresh() {
  [state.flipcharts, state.locations] = await Promise.all([
    api('/api/flipcharts'),
    api('/api/locations'),
  ]);
  render();
}

// Wraps a mutation: runs it, refreshes data, and toasts on failure.
async function mutate(fn) {
  try {
    await fn();
    await refresh();
  } catch (err) {
    toast(err.message, 'error');
    render(); // reset any optimistic control values
  }
}

// ---------- Rendering ----------

function render() {
  renderStatusChips();
  renderLocationFilter();
  renderFlipcharts();
  renderLocations();
}

function visibleFlipcharts() {
  const q = state.search.trim().toLowerCase();
  return state.flipcharts.filter((fc) => {
    if (state.statusFilter && fc.status !== state.statusFilter) return false;
    if (state.locationFilter === 'none' && fc.location_id !== null) return false;
    if (
      state.locationFilter &&
      state.locationFilter !== 'none' &&
      fc.location_id !== Number(state.locationFilter)
    ) {
      return false;
    }
    if (!q) return true;
    return [fc.name, fc.location_name || 'unassigned', fc.notes, STATUS_LABELS[fc.status]]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

function renderStatusChips() {
  // Counts respect search + location filters so the numbers match what
  // clicking each chip would show.
  const saved = state.statusFilter;
  state.statusFilter = '';
  const base = visibleFlipcharts();
  state.statusFilter = saved;

  document.querySelectorAll('#status-chips .chip').forEach((chip) => {
    const status = chip.dataset.status;
    const count = status ? base.filter((fc) => fc.status === status).length : base.length;
    chip.querySelector('.chip-count').textContent = `· ${count}`;
    chip.classList.toggle('is-active', state.statusFilter === status);
  });
}

function locationOptions(selectedId, { includeAll = false } = {}) {
  const parts = [];
  if (includeAll) {
    parts.push(`<option value="">All locations</option>`);
    parts.push(`<option value="none"${selectedId === 'none' ? ' selected' : ''}>Unassigned</option>`);
  } else {
    parts.push(`<option value=""${selectedId == null ? ' selected' : ''}>Unassigned</option>`);
  }
  for (const loc of state.locations) {
    const selected = String(selectedId) === String(loc.id) ? ' selected' : '';
    parts.push(`<option value="${loc.id}"${selected}>${esc(loc.name)}</option>`);
  }
  return parts.join('');
}

function renderLocationFilter() {
  $('#location-filter').innerHTML = locationOptions(state.locationFilter, { includeAll: true });
  $('#location-filter').value = state.locationFilter;
}

function relativeTime(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function renderFlipcharts() {
  const list = visibleFlipcharts().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
  const grid = $('#flipchart-grid');
  const empty = $('#flipcharts-empty');

  empty.hidden = list.length > 0;
  if (list.length === 0) {
    grid.innerHTML = '';
    $('#flipcharts-empty-text').textContent =
      state.flipcharts.length === 0
        ? 'No flipcharts yet — add the first one!'
        : 'No flipcharts match your filters.';
    return;
  }

  grid.innerHTML = list
    .map(
      (fc) => `
      <article class="card" data-id="${fc.id}">
        <div class="card-top">
          <h3 class="card-name">${esc(fc.name)}</h3>
          <div class="card-actions">
            <button class="icon-btn" data-action="edit" title="Edit ${esc(fc.name)}" aria-label="Edit ${esc(fc.name)}">${PENCIL_ICON}</button>
            <button class="icon-btn danger" data-action="delete" title="Delete ${esc(fc.name)}" aria-label="Delete ${esc(fc.name)}">${TRASH_ICON}</button>
          </div>
        </div>
        <div class="card-location${fc.location_id == null ? ' unassigned' : ''}">
          ${PIN_ICON}
          <span>${fc.location_id == null ? 'Unassigned' : esc(fc.location_name)}</span>
        </div>
        <span class="badge ${fc.status}">${STATUS_LABELS[fc.status]}</span>
        ${fc.notes ? `<p class="card-notes">${esc(fc.notes)}</p>` : ''}
        <div class="card-controls">
          <label>Move to
            <select data-action="move">${locationOptions(fc.location_id)}</select>
          </label>
          <label>Status
            <select data-action="status">
              ${Object.entries(STATUS_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}"${fc.status === value ? ' selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
          </label>
        </div>
        <span class="card-updated">Updated ${relativeTime(fc.updated_at)}</span>
      </article>`
    )
    .join('');
}

function renderLocations() {
  const listEl = $('#location-list');
  listEl.innerHTML = state.locations
    .map(
      (loc) => `
      <div class="location-row" data-id="${loc.id}">
        ${PIN_ICON}
        <span class="location-name">${esc(loc.name)}</span>
        <span class="location-count">${loc.flipchart_count} flipchart${loc.flipchart_count === 1 ? '' : 's'}</span>
        <button class="icon-btn" data-action="rename" title="Rename ${esc(loc.name)}" aria-label="Rename ${esc(loc.name)}">${PENCIL_ICON}</button>
        <button class="icon-btn danger" data-action="delete" title="Delete ${esc(loc.name)}" aria-label="Delete ${esc(loc.name)}">${TRASH_ICON}</button>
      </div>`
    )
    .join('');
}

// ---------- Toasts ----------

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toast-container').append(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Flipchart dialog ----------

function openFlipchartDialog(flipchart = null) {
  state.editingId = flipchart?.id ?? null;
  const form = $('#flipchart-form');
  $('#flipchart-dialog-title').textContent = flipchart ? `Edit ${flipchart.name}` : 'Add flipchart';
  form.elements.location_id.innerHTML = locationOptions(flipchart?.location_id ?? null);
  form.elements.name.value = flipchart?.name ?? '';
  form.elements.status.value = flipchart?.status ?? 'available';
  form.elements.notes.value = flipchart?.notes ?? '';
  $('#flipchart-dialog').showModal();
  form.elements.name.focus();
}

// ---------- Events ----------

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    $('#view-flipcharts').hidden = tab.dataset.tab !== 'flipcharts';
    $('#view-locations').hidden = tab.dataset.tab !== 'locations';
  });
});

$('#search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderStatusChips();
  renderFlipcharts();
});

$('#location-filter').addEventListener('change', (e) => {
  state.locationFilter = e.target.value;
  renderStatusChips();
  renderFlipcharts();
});

$('#status-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.statusFilter = chip.dataset.status;
  renderStatusChips();
  renderFlipcharts();
});

$('#add-flipchart-btn').addEventListener('click', () => openFlipchartDialog());
$('#flipchart-cancel-btn').addEventListener('click', () => $('#flipchart-dialog').close());

$('#flipchart-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const body = {
    name: form.elements.name.value,
    location_id: form.elements.location_id.value || null,
    status: form.elements.status.value,
    notes: form.elements.notes.value,
  };
  mutate(async () => {
    if (state.editingId == null) {
      await api('/api/flipcharts', { method: 'POST', body });
      toast('Flipchart added.');
    } else {
      await api(`/api/flipcharts/${state.editingId}`, { method: 'PATCH', body });
      toast('Flipchart updated.');
    }
    $('#flipchart-dialog').close();
  });
});

$('#flipchart-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;
  const id = Number(btn.closest('.card').dataset.id);
  const flipchart = state.flipcharts.find((fc) => fc.id === id);

  if (btn.dataset.action === 'edit') openFlipchartDialog(flipchart);
  if (btn.dataset.action === 'delete') {
    if (!confirm(`Delete ${flipchart.name}? This can't be undone.`)) return;
    mutate(async () => {
      await api(`/api/flipcharts/${id}`, { method: 'DELETE' });
      toast(`${flipchart.name} deleted.`);
    });
  }
});

$('#flipchart-grid').addEventListener('change', (e) => {
  const select = e.target.closest('select[data-action]');
  if (!select) return;
  const id = Number(select.closest('.card').dataset.id);
  const flipchart = state.flipcharts.find((fc) => fc.id === id);

  if (select.dataset.action === 'move') {
    const locationId = select.value || null;
    const locationName =
      locationId == null
        ? 'Unassigned'
        : state.locations.find((l) => l.id === Number(locationId))?.name;
    mutate(async () => {
      await api(`/api/flipcharts/${id}`, { method: 'PATCH', body: { location_id: locationId } });
      toast(`${flipchart.name} moved to ${locationName}.`);
    });
  }

  if (select.dataset.action === 'status') {
    const status = select.value;
    mutate(async () => {
      await api(`/api/flipcharts/${id}`, { method: 'PATCH', body: { status } });
      toast(`${flipchart.name} marked ${STATUS_LABELS[status]}.`);
    });
  }
});

$('#add-location-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#new-location-name');
  const name = input.value.trim();
  if (!name) return;
  mutate(async () => {
    await api('/api/locations', { method: 'POST', body: { name } });
    toast(`${name} added.`);
    input.value = '';
  });
});

$('#location-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = Number(btn.closest('.location-row').dataset.id);
  const location = state.locations.find((l) => l.id === id);

  if (btn.dataset.action === 'rename') {
    const name = prompt(`Rename “${location.name}” to:`, location.name);
    if (name == null || !name.trim() || name.trim() === location.name) return;
    mutate(async () => {
      await api(`/api/locations/${id}`, { method: 'PATCH', body: { name: name.trim() } });
      toast('Location renamed.');
    });
  }

  if (btn.dataset.action === 'delete') {
    const warning =
      location.flipchart_count > 0
        ? `Delete ${location.name}? Its ${location.flipchart_count} flipchart(s) will become unassigned.`
        : `Delete ${location.name}?`;
    if (!confirm(warning)) return;
    mutate(async () => {
      await api(`/api/locations/${id}`, { method: 'DELETE' });
      toast(`${location.name} deleted.`);
    });
  }
});

// ---------- Init ----------

refresh().catch(() => toast('Could not load data from the server.', 'error'));
