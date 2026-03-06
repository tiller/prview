Objective: Build a Node.js/React web-app that tracks GitHub PRs, using a SQLite database to monitor "unread" activity based on user interaction.
1. Configuration (config.json)

The app must read the following:
    GITHUB_TOKEN: Personal Access Token.
    MY_USERNAME: The user's GitHub handle.
    TEAM_MEMBERS: An explicit array of GitHub usernames (e.g., ["alice", "bob", "charlie"]).
    POLL_INTERVAL: Time between automatic syncs.

2. Logic: The Four Categories

The app must automatically fetch all open PRs the user is involved in and sort them into these buckets. Note: If a PR's metadata changes (e.g., the user is added as a reviewer), it must move categories on the next sync.
Categories:
Authored	=> PR.author == MY_USERNAME
Direct Reviewer	 => User is explicitly requested as an individual reviewer.
Team (Internal)	 => User's Team is requested (so not directly by name) AND PR.author is in the TEAM_MEMBERS array.
Team (External)	 => User's Team is requested AND PR.author is NOT in the TEAM_MEMBERS array.

3. State Tracking ("Unread" Logic)
    Storage: Use SQLite to store PR metadata and a last_viewed_at timestamp for each PR.
    Detection: A PR is flagged as "New/Changed" if the GitHub updated_at timestamp is newer than the local last_viewed_at.
    Acknowledgment: Clicking the PR (opening the link) or clicking a "Mark as Read" button must update last_viewed_at to the current time in SQLite.

4. Features & UI
    Polling: The backend polls GitHub every X minutes.
    Manual Refresh: A button in the UI to trigger an immediate backend sync.
    Sidebar: Left-nav with the 4 categories, each showing a badge count of "unread" PRs.
    Main List: Show PR title, Author (avatar), Reviewers (with ✅/❌ status), and "Last activity [X] time ago."

5. Technical Note for AI

Use the GitHub GraphQL API to fetch PRs, requested reviewers (differentiating between User and Team types), and latest commit/comment timestamps in a single request to stay efficient.
