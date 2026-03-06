const BASE = '/api';

export async function fetchPRs() {
  const res = await fetch(`${BASE}/prs`);
  if (!res.ok) throw new Error('Failed to fetch PRs');
  return res.json();
}

export async function triggerSync() {
  const res = await fetch(`${BASE}/sync`, { method: 'POST' });
  if (!res.ok) throw new Error('Sync failed');
  return res.json();
}

export async function markAsRead(id) {
  const res = await fetch(`${BASE}/prs/${encodeURIComponent(id)}/read`, { method: 'POST' });
  if (!res.ok) throw new Error('Mark as read failed');
  return res.json();
}

export async function fetchActivity(id) {
  const res = await fetch(`${BASE}/prs/${encodeURIComponent(id)}/activity`);
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json();
}

export async function markBulkAsRead(ids) {
  const res = await fetch(`${BASE}/prs/read-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Bulk mark as read failed');
  return res.json();
}
