const cron = require('node-cron');
const { fetchAndCategorizePRs } = require('./github');
const { upsertPR, deletePRsNotIn } = require('./db');

let config = null;
let isSyncing = false;
let lastSyncedAt = null;
let lastError = null;

async function sync() {
  if (isSyncing) return { status: 'already_running' };
  isSyncing = true;
  lastError = null;
  try {
    const prs = await fetchAndCategorizePRs(config);
    const ids = prs.map(pr => pr.id);
    for (const pr of prs) upsertPR(pr);
    deletePRsNotIn(ids);
    lastSyncedAt = new Date().toISOString();
    return { status: 'ok', count: prs.length };
  } catch (err) {
    lastError = err.message;
    throw err;
  } finally {
    isSyncing = false;
  }
}

function startPoller(cfg) {
  config = cfg;
  const intervalMinutes = cfg.POLL_INTERVAL || 5;
  const cronExpr = `*/${intervalMinutes} * * * *`;
  cron.schedule(cronExpr, () => {
    sync().catch(err => console.error('[poller] sync error:', err.message));
  });
  // Run once on startup
  sync().catch(err => console.error('[poller] initial sync error:', err.message));
}

function getSyncStatus() {
  return { isSyncing, lastSyncedAt, lastError };
}

module.exports = { startPoller, sync, getSyncStatus };
