import React, { useState } from 'react';
import { fetchActivity } from './api.js';

const approvalCount = pr => pr.reviewers.filter(r => r.type === 'user' && r.state === 'APPROVED').length;

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ReviewerChip({ reviewer }) {
  if (reviewer.type === 'team') {
    return <span className="chip chip-team">{reviewer.name}</span>;
  }
  const icon = reviewer.state === 'APPROVED' ? '✅' : reviewer.state === 'CHANGES_REQUESTED' ? '❌' : '⏳';
  return <span className="chip chip-user">{icon} {reviewer.login}</span>;
}

const JIRA_RE = /\b([A-Z]{4,}-\d+)\b/g;

function JiraLinks({ title }) {
  const matches = [...new Set(title.match(JIRA_RE) || [])];
  if (!matches.length) return null;
  return (
    <span className="jira-links">
      {matches.map(id => (
        <a key={id} className="jira-chip" href={`https://mirakl.atlassian.net/browse/${id}`} target="_blank" rel="noopener noreferrer">{id}</a>
      ))}
    </span>
  );
}

const REVIEW_STATE_LABEL = {
  APPROVED: { label: 'Approved', cls: 'review-approved' },
  CHANGES_REQUESTED: { label: 'Changes requested', cls: 'review-changes' },
  COMMENTED: { label: 'Commented', cls: 'review-commented' },
  DISMISSED: { label: 'Dismissed', cls: 'review-dismissed' },
};

function ActivityPanel({ prId }) {
  const [state, setState] = useState(null);

  if (!state) {
    fetchActivity(prId)
      .then(data => setState({ status: 'done', items: data.items, since: data.since }))
      .catch(e => setState({ status: 'error', error: e.message }));
    return <div className="activity-panel"><span className="activity-loading">Loading…</span></div>;
  }
  if (state.status === 'error') return <div className="activity-panel"><span className="activity-error">{state.error}</span></div>;
  if (!state.items.length) return (
    <div className="activity-panel">
      <span className="activity-empty">No new activity since {state.since ? new Date(state.since).toLocaleString() : 'last read'}.</span>
    </div>
  );

  return (
    <div className="activity-panel">
      <div className="activity-since">Activity since {state.since ? new Date(state.since).toLocaleString() : 'last read'}</div>
      <ul className="activity-list">
        {state.items.map((item, i) => (
          <li key={i} className={`activity-item activity-${item.type}`}>
            {item.avatar && <img className="activity-avatar" src={item.avatar} alt={item.author} title={item.author} />}
            <div className="activity-body">
              <span className="activity-author">{item.author}</span>
              {item.type === 'commit' && (
                <><span className="activity-tag tag-commit">commit</span><span className="activity-text">{item.message}</span></>
              )}
              {item.type === 'comment' && (
                <><span className="activity-tag tag-comment">comment</span><span className="activity-text">{item.body.slice(0, 200)}{item.body.length > 200 ? '…' : ''}</span></>
              )}
              {item.type === 'review' && (
                <>
                  <span className={`activity-tag ${REVIEW_STATE_LABEL[item.state]?.cls || 'tag-comment'}`}>
                    {REVIEW_STATE_LABEL[item.state]?.label || item.state}
                  </span>
                  {item.body && <span className="activity-text">{item.body.slice(0, 200)}{item.body.length > 200 ? '…' : ''}</span>}
                </>
              )}
              <span className="activity-time">{timeAgo(item.date)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PRItem({ pr, onOpen, onMarkRead }) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = (e) => {
    if (e.target.closest('a, button')) return;
    setExpanded(v => !v);
  };

  return (
    <li className={`pr-item ${pr.is_unread ? 'unread' : ''} ${expanded ? 'expanded' : ''}`} onClick={toggleExpand}>
      <div className="pr-main">
        <div className="pr-top">
          <img
            className="avatar"
            src={pr.author_avatar}
            alt={pr.author_login}
            title={pr.author_login}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <a className="pr-title" href={pr.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(pr)}>
            {pr.is_unread && <span className="unread-dot" />}
            {pr.repo}#{pr.number} — {pr.title}
          </a>
        </div>
        <div className="pr-meta">
          <span className="pr-author">@{pr.author_login}</span>
          <JiraLinks title={pr.title} />
          <span className="pr-age">Last activity {timeAgo(pr.github_updated_at)}</span>
          <div className="pr-reviewers">
            {pr.reviewers.filter(r => r.type === 'user' && r.login !== 'copilot-pull-request-reviewer').map((r, i) => (
              <ReviewerChip key={i} reviewer={r} />
            ))}
          </div>
        </div>
      </div>
      <div className="pr-actions">
        {pr.is_unread && (
          <button className="btn-read" onClick={(e) => { e.stopPropagation(); onMarkRead(pr.id); }}>
            Mark as read
          </button>
        )}
        <a className="btn-read btn-github" href={pr.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          See in GitHub
        </a>
      </div>
      {expanded && <ActivityPanel prId={pr.id} />}
    </li>
  );
}

function PRGroup({ title, prs, onOpen, onMarkRead }) {
  if (prs.length === 0) return null;
  return (
    <>
      <li className="pr-group-header">{title} <span className="pr-group-count">{prs.length}</span></li>
      {prs.map(pr => <PRItem key={pr.id} pr={pr} onOpen={onOpen} onMarkRead={onMarkRead} />)}
    </>
  );
}

function MissingApprovalsToggle({ value, onChange, hiddenCount }) {
  return (
    <div className="team-toolbar">
      <button className={`toggle-btn ${value ? 'active' : ''}`} onClick={() => onChange(v => !v)}>
        Missing approvals only{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
      </button>
    </div>
  );
}

function TeamView({ prs, onOpen, onMarkRead }) {
  const [filterMissing, setFilterMissing] = useState(true);

  const apply = list => filterMissing ? list.filter(pr => approvalCount(pr) < 2) : list;
  const reviewing = apply(prs.filter(pr => pr.category === 'team-internal'));
  const watching  = apply(prs.filter(pr => pr.category === 'team-watching'));
  const hiddenCount = filterMissing ? prs.filter(pr => approvalCount(pr) >= 2).length : 0;

  return (
    <>
      <MissingApprovalsToggle value={filterMissing} onChange={setFilterMissing} hiddenCount={hiddenCount} />
      <ul className="pr-list">
        <PRGroup title="Review requested" prs={reviewing} onOpen={onOpen} onMarkRead={onMarkRead} />
        <PRGroup title="From your team"   prs={watching}  onOpen={onOpen} onMarkRead={onMarkRead} />
      </ul>
    </>
  );
}

function OthersView({ prs, onOpen, onMarkRead }) {
  const [filterMissing, setFilterMissing] = useState(true);

  const visible = filterMissing ? prs.filter(pr => approvalCount(pr) < 2) : prs;
  const hiddenCount = filterMissing ? prs.filter(pr => approvalCount(pr) >= 2).length : 0;

  return (
    <>
      <MissingApprovalsToggle value={filterMissing} onChange={setFilterMissing} hiddenCount={hiddenCount} />
      <ul className="pr-list">
        {visible.map(pr => <PRItem key={pr.id} pr={pr} onOpen={onOpen} onMarkRead={onMarkRead} />)}
      </ul>
    </>
  );
}

export default function PRList({ prs, category, onOpen, onMarkRead }) {
  if (prs.length === 0) {
    return <div className="empty">No pull requests in this category.</div>;
  }

  if (category === 'direct') {
    const needsReview = prs.filter(pr => pr.my_review_state !== 'APPROVED');
    const approved = prs.filter(pr => pr.my_review_state === 'APPROVED');
    return (
      <ul className="pr-list">
        <PRGroup title="Needs your review" prs={needsReview} onOpen={onOpen} onMarkRead={onMarkRead} />
        <PRGroup title="Approved by you" prs={approved} onOpen={onOpen} onMarkRead={onMarkRead} />
      </ul>
    );
  }

  if (category === 'team-internal') {
    return <TeamView prs={prs} onOpen={onOpen} onMarkRead={onMarkRead} />;
  }

  if (category === 'team-external') {
    return <OthersView prs={prs} onOpen={onOpen} onMarkRead={onMarkRead} />;
  }

  return (
    <ul className="pr-list">
      {prs.map(pr => <PRItem key={pr.id} pr={pr} onOpen={onOpen} onMarkRead={onMarkRead} />)}
    </ul>
  );
}
