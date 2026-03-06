import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar.jsx';
import PRList from './PRList.jsx';
import { fetchPRs, triggerSync, markAsRead, markBulkAsRead } from './api.js';

const CATEGORIES = [
  { key: 'authored', label: 'Authored' },
  { key: 'direct', label: 'Direct Reviewer' },
  { key: 'team-internal', label: 'Team' },
  { key: 'team-external', label: 'Others' },
];

const POLL_MS = 30_000;

export default function App() {
  const [prs, setPRs] = useState([]);
  const [syncStatus, setSyncStatus] = useState({});
  const validKeys = CATEGORIES.map(c => c.key);
  const pathKey = window.location.pathname.slice(1);
  const initialKey = validKeys.includes(pathKey) ? pathKey : 'authored';
  const [activeCategory, setActiveCategory] = useState(initialKey);

  useEffect(() => {
    document.title = `${CATEGORIES.find(c => c.key === initialKey)?.label} | Pr_view`;
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPRs();
      setPRs(data.prs);
      setSyncStatus(data.sync);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkRead = async (id) => {
    await markAsRead(id);
    setPRs(prev => prev.map(pr =>
      pr.id === id ? { ...pr, is_unread: false, last_viewed_at: new Date().toISOString() } : pr
    ));
  };

  const handleOpen = async (pr) => {
    await handleMarkRead(pr.id);
  };

  const handleMarkPageRead = async () => {
    const ids = filtered.filter(pr => pr.is_unread).map(pr => pr.id);
    if (!ids.length) return;
    await markBulkAsRead(ids);
    setPRs(prev => prev.map(pr =>
      ids.includes(pr.id) ? { ...pr, is_unread: false, last_viewed_at: new Date().toISOString() } : pr
    ));
  };

  const handleMarkAllRead = async () => {
    const ids = prs.filter(pr => pr.is_unread).map(pr => pr.id);
    if (!ids.length) return;
    await markBulkAsRead(ids);
    setPRs(prev => prev.map(pr =>
      ids.includes(pr.id) ? { ...pr, is_unread: false, last_viewed_at: new Date().toISOString() } : pr
    ));
  };

  const TEAM_CATS = ['team-internal', 'team-watching', 'team-external'];
  const effectiveUnread = (pr) => TEAM_CATS.includes(pr.category) ? !pr.last_viewed_at : pr.is_unread;

  const unreadCounts = {};
  for (const cat of CATEGORIES) {
    const cats = cat.key === 'team-internal' ? ['team-internal', 'team-watching'] : [cat.key];
    unreadCounts[cat.key] = prs.filter(pr => cats.includes(pr.category) && effectiveUnread(pr)).length;
  }

  const filtered = activeCategory === 'team-internal'
    ? prs.filter(pr => pr.category === 'team-internal' || pr.category === 'team-watching')
    : prs.filter(pr => pr.category === activeCategory);
  const pageUnreadCount = filtered.filter(effectiveUnread).length;
  const totalUnreadCount = prs.filter(effectiveUnread).length;

  return (
    <div className="app">
      <header className="header">
        <span className="header-title">Pr_view</span>
        <div className="header-actions">
          {syncStatus.lastSyncedAt && (
            <span className="sync-time">
              Last sync: {new Date(syncStatus.lastSyncedAt).toLocaleTimeString()}
            </span>
          )}
          {syncStatus.lastError && (
            <span className="sync-error" title={syncStatus.lastError}>Sync error</span>
          )}
          {pageUnreadCount > 0 && (
            <button className="btn-refresh" onClick={handleMarkPageRead}>
              Mark page as read ({pageUnreadCount})
            </button>
          )}
          {totalUnreadCount > 0 && (
            <button className="btn-refresh" onClick={handleMarkAllRead}>
              Mark all as read ({totalUnreadCount})
            </button>
          )}
          <button className="btn-refresh" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      </header>
      <div className="layout">
        <Sidebar
          categories={CATEGORIES}
          active={activeCategory}
          unreadCounts={unreadCounts}
          onSelect={key => {
            setActiveCategory(key);
            window.history.pushState(null, '', `/${key}`);
            document.title = `${CATEGORIES.find(c => c.key === key)?.label} | Pr_view`;
          }}
        />
        <main className="main">
          {error && <div className="error-banner">{error}</div>}
          <PRList
            prs={filtered.map(pr => ({ ...pr, is_unread: effectiveUnread(pr) }))}
            category={activeCategory}
            onOpen={handleOpen}
            onMarkRead={handleMarkRead}
          />
        </main>
      </div>
    </div>
  );
}
