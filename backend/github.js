const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const GITHUB_GRAPHQL = 'https://api.github.com/graphql';

const PR_FIELDS = `
  id
  number
  title
  url
  updatedAt
  createdAt
  state
  isDraft
  author { login avatarUrl }
  repository { nameWithOwner }
  reviewRequests(first: 20) {
    nodes {
      requestedReviewer {
        __typename
        ... on User { login }
        ... on Team { name slug organization { login } }
      }
    }
  }
  reviews(first: 50) {
    nodes {
      author { login }
      state
    }
  }
`;

const AUTHORED_QUERY = `
query($login: String!) {
  user(login: $login) {
    pullRequests(first: 100, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { ${PR_FIELDS} }
    }
  }
}
`;

const SEARCH_QUERY = `
query($q: String!) {
  search(query: $q, type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest { ${PR_FIELDS} }
    }
  }
}
`;

async function graphql(token, query, variables) {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    const msg = json.errors.map(e => e.message).join('; ');
    throw new Error(`GitHub API error: ${msg}`);
  }
  return json.data;
}

// State priority: higher index wins when a reviewer has multiple review nodes
const STATE_PRIORITY = ['COMMENTED', 'PENDING', 'DISMISSED', 'CHANGES_REQUESTED', 'APPROVED'];

function buildReviewers(reviewRequestNodes, reviewNodes, authorLogin = '') {
  // Collect latest/most significant state per user from actual reviews
  const reviewStates = {};
  for (const r of (reviewNodes || [])) {
    const login = r?.author?.login;
    if (!login || login === authorLogin) continue;
    const current = reviewStates[login];
    if (!current || STATE_PRIORITY.indexOf(r.state) > STATE_PRIORITY.indexOf(current)) {
      reviewStates[login] = r.state;
    }
  }

  // Start with explicitly requested reviewers (pending or already reviewed)
  const seen = new Set();
  const result = [];

  for (const node of (reviewRequestNodes || [])) {
    const rr = node?.requestedReviewer;
    if (!rr) continue;
    if (rr.__typename === 'User') {
      if (rr.login === authorLogin) continue;
      seen.add(rr.login);
      result.push({ type: 'user', login: rr.login, state: reviewStates[rr.login] || 'PENDING' });
    } else {
      result.push({ type: 'team', name: rr.name || rr.slug, slug: rr.slug, org: rr.organization?.login, state: 'PENDING' });
    }
  }

  // Add anyone who actually reviewed but is no longer in the request list
  for (const [login, state] of Object.entries(reviewStates)) {
    if (!seen.has(login)) {
      result.push({ type: 'user', login, state });
    }
  }

  return result;
}

function categorizePR(pr, myUsername, teamMembers) {
  const authorLogin = pr.author?.login || '';
  const reviewers = buildReviewers(
    pr.reviewRequests?.nodes,
    pr.reviews?.nodes,
    authorLogin
  );

  const isMe = authorLogin.toLowerCase() === myUsername.toLowerCase();
  const myReviewEntry = reviewers.find(
    r => r.type === 'user' && r.login.toLowerCase() === myUsername.toLowerCase()
  );
  const isDirectReviewer = !!myReviewEntry;
  const isTeamReviewer = reviewers.some(r => r.type === 'team');

  const authorInTeam = teamMembers.map(m => m.toLowerCase()).includes(authorLogin.toLowerCase());

  let category;
  if (isMe) {
    category = 'authored';
  } else if (isDirectReviewer) {
    category = 'direct';
  } else if (isTeamReviewer) {
    category = authorInTeam ? 'team-internal' : 'team-external';
  } else if (authorInTeam && !pr.isDraft) {
    category = 'team-watching';
  } else {
    category = 'direct';
  }

  return {
    id: pr.id,
    number: pr.number,
    repo: pr.repository.nameWithOwner,
    title: pr.title,
    url: pr.url,
    author_login: authorLogin,
    author_avatar: pr.author?.avatarUrl || '',
    category,
    my_review_state: myReviewEntry?.state || null,
    github_updated_at: pr.updatedAt,
    created_at: pr.createdAt,
    reviewers,
  };
}

async function fetchAndCategorizePRs(config) {
  const { GITHUB_TOKEN: token, MY_USERNAME: me, TEAM_MEMBERS: teamMembers } = config;

  const teamAuthorsQuery = teamMembers.map(m => `author:${m}`).join(' ');
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [authoredData, requestedData, reviewedData, teamData] = await Promise.all([
    graphql(token, AUTHORED_QUERY, { login: me }),
    graphql(token, SEARCH_QUERY, { q: `is:open is:pr review-requested:${me}` }),
    graphql(token, SEARCH_QUERY, { q: `is:open is:pr reviewed-by:${me}` }),
    teamMembers.length > 0
      ? graphql(token, SEARCH_QUERY, { q: `is:open is:pr -is:draft created:>${since30d} ${teamAuthorsQuery}` })
      : Promise.resolve({ search: { nodes: [] } }),
  ]);

  const prMap = new Map();

  const addPR = (pr) => {
    if (!pr || !pr.id) return;
    if (pr.state && pr.state !== 'OPEN') return;
    if (!prMap.has(pr.id)) prMap.set(pr.id, pr);
  };

  for (const pr of (authoredData.user?.pullRequests?.nodes || [])) addPR(pr);
  for (const node of (requestedData.search?.nodes || [])) addPR(node);
  for (const node of (reviewedData.search?.nodes || [])) addPR(node);
  for (const node of (teamData.search?.nodes || [])) addPR(node);

  const results = [];
  for (const pr of prMap.values()) {
    results.push(categorizePR(pr, me, teamMembers));
  }

  return results;
}

const ACTIVITY_QUERY = `
query($id: ID!, $since: DateTime!) {
  node(id: $id) {
    ... on PullRequest {
      timelineItems(first: 50, since: $since, itemTypes: [
        PULL_REQUEST_COMMIT,
        ISSUE_COMMENT,
        PULL_REQUEST_REVIEW
      ]) {
        nodes {
          __typename
          ... on PullRequestCommit {
            commit {
              message
              committedDate
              author { name user { login avatarUrl } }
            }
          }
          ... on IssueComment {
            createdAt
            body
            author { login avatarUrl }
          }
          ... on PullRequestReview {
            submittedAt
            state
            body
            author { login avatarUrl }
          }
        }
      }
    }
  }
}
`;

async function fetchActivity(config, nodeId, since) {
  const { GITHUB_TOKEN: token } = config;
  const data = await graphql(token, ACTIVITY_QUERY, { id: nodeId, since });
  const nodes = data?.node?.timelineItems?.nodes || [];

  return nodes.map(node => {
    if (node.__typename === 'PullRequestCommit') {
      const c = node.commit;
      return {
        type: 'commit',
        date: c.committedDate,
        message: c.message.split('\n')[0],
        author: c.author?.user?.login || c.author?.name || 'unknown',
        avatar: c.author?.user?.avatarUrl || null,
      };
    }
    if (node.__typename === 'IssueComment') {
      return { type: 'comment', date: node.createdAt, body: node.body, author: node.author?.login || 'unknown', avatar: node.author?.avatarUrl || null };
    }
    if (node.__typename === 'PullRequestReview') {
      return { type: 'review', date: node.submittedAt, state: node.state, body: node.body || null, author: node.author?.login || 'unknown', avatar: node.author?.avatarUrl || null };
    }
    return null;
  }).filter(Boolean);
}

module.exports = { fetchAndCategorizePRs, fetchActivity };
