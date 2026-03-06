import React from 'react';

export default function Sidebar({ categories, active, unreadCounts, onSelect }) {
  return (
    <nav className="sidebar">
      <ul>
        {categories.map(cat => (
          <li key={cat.key}>
            <button
              className={`sidebar-item ${active === cat.key ? 'active' : ''}`}
              onClick={() => onSelect(cat.key)}
            >
              <span className="sidebar-label">{cat.label}</span>
              {unreadCounts[cat.key] > 0 && (
                <span className="badge">{unreadCounts[cat.key]}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
