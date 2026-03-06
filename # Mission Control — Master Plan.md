# Mission Control — Master Plan

Version 1.0 | March 4, 2026
Consolidated from 4 reference documents into a single engineering specification.

---

## Executive Summary

Mission Control is a centralized AI agent observability and management dashboard designed to run on localhost. It provides a dark-themed command center interface for registering AI agents, tracking tasks, streaming logs, monitoring costs, and visualizing agent activity in real time. The system is framework-agnostic — any AI agent, regardless of the underlying framework (LangChain, CrewAI, custom Python scripts, or anything else), can register itself via a simple REST API and begin reporting telemetry.

The backend is built with Python and FastAPI. The frontend is React with Vite. PostgreSQL handles persistence. WebSockets deliver real-time updates. The entire stack runs locally via Docker Compose with a single command.

This document serves as the definitive engineering specification. It covers architecture, data models, API surface, frontend design, phased delivery, and all appendices needed to build the system from scratch.

---

## Table of Contents

1. Architecture Overview
2. Phase 1 — MVP (Core Foundation)
   - 2.1 Project Structure
   - 2.2 Backend Core (FastAPI)
   - 2.3 Data Models
   - 2.4 Background Services
   - 2.5 Frontend Core (React + Vite)
   - 2.6 Core Pages
   - 2.7 SVG Icon System
   - 2.8 Real-time System
   - 2.9 Developer Experience
3. Phase 2 — Enhanced Visualization and Management
   - 3.1 Visual Office Map
   - 3.2 Agent Hierarchy and Organization
   - 3.3 Advanced Analytics
   - 3.4 Workflow Engine
   - 3.5 Notifications and Alerts v2
   - 3.6 Document and Knowledge Base
4. Phase 3 — Social Feeds and External Integrations
   - 4.1 Social Feed Panel
   - 4.2 Content Intelligence Pipeline
   - 4.3 External Integrations
   - 4.4 Multi-User Support
5. Phase 4 — Future Vision
6. Appendix A: Tech Stack Summary
7. Appendix B: Project Directory Structure
8. Appendix C: API Quick Reference
9. Appendix D: WebSocket Events Reference
10. Appendix E: Database Schema Overview
11. Appendix F: Color System Reference

---

## 1. Architecture Overview

The system follows a clean three-tier architecture. The Python backend owns all business logic, data access, agent management, and real-time event distribution. The React frontend is a thin visual layer that consumes the backend API and renders the command center interface. PostgreSQL stores all persistent data. Communication between frontend and backend uses REST for CRUD operations and a single WebSocket connection for real-time event streaming.

The reason Python was chosen over Node.js or Next.js is practical: the entire AI and ML ecosystem is Python-first. The Anthropic SDK, OpenAI SDK, LangChain, CrewAI, OpenRouter clients, and virtually every agent framework ships Python-native libraries. As Mission Control grows to include deeper agent orchestration, model routing, and analytics, Python will always have first-class support. FastAPI provides async performance, automatic OpenAPI documentation, native WebSocket support, and Pydantic validation — matching or exceeding what Express or Next.js API routes offer while staying in the Python ecosystem.

The frontend uses React and Vite because the UI requirements — real-time log streaming, interactive SVG office maps, drag-and-drop workflow builders, and multi-panel layouts — demand a proper component framework. Vite keeps the dev experience fast. TailwindCSS handles the dark theme styling without custom CSS overhead. The frontend is purely a presentation layer; all logic lives in the backend.

Agents integrate by making HTTP calls to the Mission Control API. When an agent starts up, it calls POST /api/agents/register with its name, type, capabilities, and model. While running, it sends heartbeats, creates tasks, appends logs, and reports costs. This design means any agent in any framework can integrate with Mission Control by adding a handful of HTTP calls — no SDK required, no framework lock-in.

---

## 2. Phase 1 — MVP (Core Foundation)

Goal: Get a working dashboard running on localhost that can register agents, track tasks, show logs, and display costs. Everything updating in real time. A developer should be able to run docker-compose up and have a fully functional command center with seeded demo data.

### 2.1 Project Structure

The project uses a monorepo layout. The backend and frontend live in the same repository but are independently built and containerized. Shared type definitions and documentation sit at the root level.

The top-level directories are: backend/ for the FastAPI application, frontend/ for the React+Vite application, shared/ for any shared constants or configuration schemas, docs/ for project documentation, and scripts/ for setup, migration, and seed utilities. The root contains docker-compose.yml, Makefile, README.md, and .env.example.

Docker Compose orchestrates three services for local development: a PostgreSQL 15 container with a named volume for data persistence, the backend container running uvicorn with hot reload, and the frontend container running the Vite dev server. A single docker-compose up starts everything. The backend waits for PostgreSQL to be healthy before starting, runs Alembic migrations automatically, and then seeds demo data if the database is empty.

### 2.2 Backend Core (FastAPI)

The backend application lives in backend/app/ and follows a standard FastAPI project layout. The entry point is main.py, which creates the FastAPI app instance, includes all routers, sets up CORS middleware, initializes the database connection pool, starts background services, and opens the WebSocket endpoint.

The config.py module reads environment variables via Pydantic Settings: database URL, allowed origins, heartbeat timeout, log level, and any API keys needed for future integrations. The database.py module configures SQLAlchemy async engine and session factory, pointing at PostgreSQL in production and SQLite in development fallback mode.

Routers are organized by domain. The agents router handles agent registration, listing, detail retrieval, status updates, and heartbeat reception. The tasks router handles task creation, listing, detail, status updates, and result recording. The logs router handles log entry creation and the global log stream with filtering. The costs router handles cost record creation and aggregated queries for summaries, daily breakdowns, and projections. The metrics router exposes system-level metrics. The health router provides a simple health check that verifies database connectivity. The websocket router manages the persistent WebSocket connection for real-time event streaming.

Services encapsulate background logic. The heartbeat monitor runs on a configurable interval and marks any agent as offline if it has not sent a heartbeat within the threshold. The cost aggregator periodically rolls up individual cost records into daily and weekly summary rows for fast querying. The alert engine checks configurable thresholds (cost limits, error rates, agent offline duration) and generates alert records when thresholds are breached. The websocket manager maintains a registry of connected clients and broadcasts events to all of them.

Middleware includes CORS configuration (permissive for localhost development), request logging with timing, and error handling that returns consistent JSON error responses.

The full list of API endpoints for Phase 1 is as follows.

POST /api/agents/register accepts agent self-registration with name, type, capabilities list, model identifier, and optional configuration object. Returns the created agent with its assigned ID.

GET /api/agents returns all registered agents with their current status, last heartbeat time, total task count, and total cost.

GET /api/agents/{id} returns full detail for a single agent including recent tasks, recent logs, and cost breakdown.

PATCH /api/agents/{id}/status updates an agent's status. Valid statuses are idle, working, error, paused, and offline.

POST /api/agents/{id}/heartbeat receives a heartbeat ping from an agent, updating its last_heartbeat timestamp and confirming it is alive.

POST /api/tasks creates a new task assigned to a specific agent with title, description, priority, and input data.

GET /api/tasks returns a paginated list of tasks with optional filters for status, agent ID, date range, and priority.

GET /api/tasks/{id} returns full task detail including input, output, all associated log entries, cost records, and duration.

PATCH /api/tasks/{id} updates a task's status, output, error message, or marks it complete.

POST /api/tasks/{id}/logs appends a log entry to a specific task with level, message, and optional metadata.

GET /api/logs returns the global log stream with filters for agent, level, date range, and text search. Supports pagination and newest-first ordering.

GET /api/costs/summary returns cost overview data: total spend, spend per agent, spend per model, for a given time period.

GET /api/costs/daily returns daily cost breakdown as a time series for charting.

GET /api/metrics returns system-level metrics: total agents, active agents, running tasks, completed tasks today, error count today, and total cost today.

GET /api/health returns service health status including database connectivity.

WebSocket /ws/events is the persistent connection for real-time event streaming. On connect, the client is added to the broadcast registry. The server pushes JSON events for all state changes.

### 2.3 Data Models

All models use UUID primary keys generated server-side. Timestamps use UTC. Monetary values are stored as decimal with four decimal places.

The Agent model contains: id (UUID, primary key), name (string, required, unique), type (string, e.g. "researcher", "writer", "coder", "analyst"), status (enum: idle, working, error, paused, offline — default idle), capabilities (JSON array of strings), model (string, e.g. "claude-sonnet-4-20250514", "gpt-4o"), created_at (timestamp, auto-set), last_heartbeat (timestamp, nullable), total_tasks (integer, default 0), total_cost (decimal, default 0.0), and config (JSON object for arbitrary agent configuration).

The Task model contains: id (UUID, primary key), agent_id (UUID, foreign key to Agent), title (string, required), description (text, nullable), status (enum: queued, running, completed, failed, cancelled — default queued), priority (enum: low, medium, high, critical — default medium), input (JSON object), output (JSON object, nullable), cost (decimal, default 0.0), tokens_used (integer, default 0), started_at (timestamp, nullable), completed_at (timestamp, nullable), created_at (timestamp, auto-set), and error_message (text, nullable).

The LogEntry model contains: id (UUID, primary key), task_id (UUID, foreign key to Task, nullable — allows agent-level logs not tied to a task), agent_id (UUID, foreign key to Agent), level (enum: debug, info, warn, error), message (text, required), timestamp (timestamp, auto-set), and metadata (JSON object, nullable).

The CostRecord model contains: id (UUID, primary key), agent_id (UUID, foreign key to Agent), task_id (UUID, foreign key to Task, nullable), model (string, the LLM model used), input_tokens (integer), output_tokens (integer), cost_usd (decimal with four decimal places), and timestamp (timestamp, auto-set).

The Alert model contains: id (UUID, primary key), type (string, e.g. "cost_threshold", "agent_offline", "high_error_rate"), severity (enum: info, warning, critical), message (text), agent_id (UUID, foreign key to Agent, nullable), task_id (UUID, foreign key to Task, nullable), acknowledged (boolean, default false), and created_at (timestamp, auto-set).

Relationships: An Agent has many Tasks, many LogEntries, many CostRecords, and many Alerts. A Task has many LogEntries, many CostRecords, and belongs to one Agent. LogEntry belongs to one Agent and optionally one Task. CostRecord belongs to one Agent and optionally one Task. Alert optionally belongs to one Agent and optionally one Task.

### 2.4 Background Services

Three background services run within the FastAPI application using APScheduler.

The Heartbeat Monitor runs every 30 seconds (configurable). It queries all agents whose status is not offline and whose last_heartbeat is older than the configured timeout (default 120 seconds). Any agent exceeding the timeout is set to offline status and a WebSocket event is broadcast. An alert of type agent_offline with severity warning is created.

The Cost Aggregator runs every 5 minutes. It processes any new CostRecord entries that have not yet been included in a daily summary. It updates or creates DailyCostSummary rows (an internal rollup table) with totals per agent, per model, and overall. This ensures the /api/costs/daily endpoint returns fast even with millions of individual cost records.

The Alert Engine runs every 60 seconds. It checks all configured alert rules against current data. Default rules include: total daily cost exceeds threshold (default \$10), any single agent's error rate in the last hour exceeds 50%, any agent has been offline for more than 10 minutes without being manually paused. When a rule triggers, an Alert record is created and a WebSocket event is broadcast. Alerts are not re-triggered if an identical unacknowledged alert already exists.

### 2.5 Frontend Core (React + Vite)

The frontend is a single-page application built with React 18, TypeScript, Vite as the build tool, TailwindCSS for styling, React Router for navigation, Zustand for global state management, and TanStack Query (React Query) for server state and data fetching.

The dark theme is applied globally. The color palette is defined as CSS custom properties on the root element and mapped into the Tailwind configuration for utility class usage. The palette is designed to evoke a NASA/military command center aesthetic — deep dark backgrounds with high-contrast accent colors for status and data visualization.

Background colors use three tiers: the deepest background at #0a0a0f for the page body, #12121a for panel and sidebar backgrounds, and #1a1a2e for cards and elevated surfaces. A subtle fourth tier at #16213e can be used for hover states on cards.

Accent colors are semantic. Green #00ff88 means success, active, healthy, or online. Red #ff4444 means error, critical, failure, or offline. Amber #ffaa00 means warning, caution, or degraded. Teal #4ecdc4 is used for informational highlights, secondary actions, and the info severity level. Purple #a855f7 is used sparingly for special highlights, premium features, or unique states.

Text uses three levels: primary white #ffffff for headings and important data, secondary slate #94a3b8 for body text and descriptions, and muted slate #64748b for timestamps, labels, and de-emphasized content.

Borders and dividers use #1e293b for subtle separation between elements.

The layout has three persistent regions. The left sidebar is 240px wide, contains the Mission Control logo/wordmark at top, navigation links with icons for each page, and a compact system status indicator at the bottom showing connected/disconnected state. The top header bar spans the remaining width and shows the current page title, a global search input, a notification bell (Phase 2), and a compact cost-today counter. The main content area fills the remaining space and renders the active page.

State management follows a clear pattern. Zustand stores hold real-time data pushed via WebSocket: agent statuses, live log entries, active alerts, and connection state. TanStack Query handles all REST API data fetching with caching, background refetching, and pagination. When a WebSocket event arrives, the relevant Zustand store is updated and any affected TanStack Query cache is invalidated so the UI reflects changes immediately.

### 2.6 Core Pages

There are six pages in the Phase 1 MVP.

Page 1: Command Center (Dashboard). This is the home page and the primary view. At the top, four summary cards display in a horizontal row: Total Agents (count, with active/total breakdown), Active Tasks (currently running), Today's Cost (USD with two decimal places and a delta vs yesterday), and Error Rate (percentage of failed tasks in the last 24 hours with color coding — green below 5%, amber 5-15%, red above 15%).

Below the summary cards, the page splits into a two-column layout. The left column (roughly 60% width) contains the Agent Status Grid and the Active Tasks List. The Agent Status Grid shows all registered agents as compact cards in a responsive grid. Each card displays the agent name, a color-coded status dot (green for idle, pulsing green for working, red for error, grey for offline, amber for paused), the agent type as a small SVG icon, and the current task name if working. Cards link to the agent detail page on click.

The Active Tasks List shows all tasks with status "running" as a vertical list. Each row shows the task title, the assigned agent name, the duration so far (live counter), priority badge, and a compact progress indicator if available. Rows link to task detail on click.

The right column (roughly 40% width) contains the Recent Activity Feed and the Cost Sparkline. The Recent Activity Feed is a scrolling list of the most recent 50 events: agent registrations, task completions, task failures, alerts, and status changes. Each entry shows a timestamp, a small icon for the event type, and a one-line description. New entries animate in at the top. The Cost Sparkline is a small line chart showing the last 7 days of total daily cost, rendered with Recharts.

Everything on this page updates in real time via the WebSocket connection. When an agent status changes, the grid updates. When a task completes, it moves from active to the activity feed. When costs are recorded, the sparkline and today's cost card refresh.

Page 2: Agents. This page has two viewing modes toggled by a button: grid view (default) and list view. In grid view, agents display as medium-sized cards with name, type icon, status dot, model name, total tasks completed, total cost, and last heartbeat time. In list view, the same data appears in a table with sortable columns.

Above the agent display is a toolbar with a search input to filter by name, a status filter dropdown, and a "Register Agent" button that opens a modal form. The registration form accepts name, type (dropdown), capabilities (tag input), model (dropdown or free text), and optional configuration JSON.

Clicking an agent opens its detail view, either as a slide-out panel or a dedicated page (developer's choice during implementation). The detail view shows: the agent's full configuration, a status timeline showing recent status changes, the last 20 tasks as a compact list with status icons, the last 50 log entries for that agent, a cost breakdown showing spend per day for the last 30 days as a small bar chart, and action buttons to Pause, Resume, or Remove the agent.

Page 3: Tasks. The tasks page shows a filterable, sortable, paginated list of all tasks. The filter bar includes: status multi-select (queued, running, completed, failed, cancelled), agent dropdown, priority dropdown, date range picker, and a search input for title text. The task list shows each task as a row with title, agent name, status badge (color-coded), priority badge, created time, duration (or running duration for active tasks), and cost.

Clicking a task opens its detail view. Task detail shows: the full title and description, status with timestamp for each status transition, the assigned agent with a link to agent detail, priority, full input JSON (formatted and syntax-highlighted), full output JSON (formatted and syntax-highlighted), error message if failed, total cost and token usage, all log entries for this task in chronological order, and all cost records for this task.

A "Create Task" button opens a form to manually create and assign a task with title, description, agent selection, priority, and input JSON.

Page 4: Logs. The logs page is a real-time log streaming view. Logs display as a vertical list with newest at top by default but with an option to switch to chronological order. Each log entry shows a timestamp, a colored level badge (grey for debug, blue for info, amber for warn, red for error), the agent name, the task title if associated, and the message text.

The filter bar includes: agent dropdown, level multi-select, date range, and a text search input that filters on message content. There is an auto-scroll toggle — when enabled, the view stays pinned to the newest entries. When the user scrolls up to read older entries, auto-scroll pauses and a "Jump to latest" button appears.

The log stream connects to the WebSocket for real-time updates. When new log entries arrive, they prepend to the list (or append in chronological mode). The page also supports loading older entries via paginated REST calls when scrolling to the end.

Page 5: Cost and Analytics. This page provides financial visibility into agent operations. At the top, a period selector allows choosing: today, last 7 days, last 30 days, this month, or custom date range. All charts and figures below respond to this selection.

The overview section shows: total spend for the period, average daily spend, projected monthly spend (average daily times remaining days in month), and spend vs budget if a budget threshold is configured.

Below the overview, four charts are arranged in a 2x2 grid. The Cost per Agent chart is a horizontal bar chart showing total spend per agent for the selected period, sorted by highest spend. The Cost per Model chart is a donut/pie chart showing spend distribution across different LLM models. The Daily Cost Trend chart is a line chart showing daily spend over the selected period with an optional trend line. The Token Usage chart is a stacked bar chart showing input tokens vs output tokens per day.

Below the charts, a Budget Settings section allows configuring a daily cost threshold and a monthly cost threshold. When spending approaches or exceeds these thresholds, alerts are generated by the backend alert engine.

Page 6: Settings. The settings page contains configuration options organized into sections. The Connection section shows the current database connection status, backend API URL, and WebSocket connection state. The Alerts section allows configuring: daily cost threshold, monthly cost threshold, agent offline timeout (how many seconds before an agent is marked offline), error rate threshold (percentage that triggers an alert). The Data section provides buttons to export all data as CSV, export agent configurations as JSON, and clear old log entries (with a date threshold). The About section shows the Mission Control version, backend version, and links to documentation.

### 2.7 SVG Icon System

All icons and visual indicators are inline SVG elements — no external image files, no icon fonts, no heavy sprite sheets. This keeps the application fast and eliminates loading delays.

Agent type icons are simple, recognizable SVG illustrations at 24x24 or 32x32 scale: a magnifying glass for researcher, a pen for writer, angle brackets for coder, a bar chart for analyst, a gear for utility, a brain for general AI, and a people icon for manager. These are stored as React components in a central SVGIcons.tsx file.

Status indicators use a small circle (8px diameter) with color fill matching the status. The "working" status adds a CSS pulse animation to the dot. The "error" status uses a subtle glow effect via SVG filter or box-shadow. The "offline" status reduces opacity.

Empty states (when a page has no data) use a larger SVG illustration — a simple line drawing style at roughly 200x200 — with a message below. Examples: a rocket on a launchpad for "No agents registered yet", an empty clipboard for "No tasks found", a quiet radio tower for "No logs to display".

### 2.8 Real-time System

A single WebSocket connection is established when the frontend loads and maintained throughout the session. The connection URL is ws://localhost:8000/ws/events (configurable). On the backend, the WebSocket manager maintains a set of connected clients and provides a broadcast method that sends a JSON message to all connected clients.

Each WebSocket message is a JSON object with a type field indicating the event type, a timestamp, and a payload containing the relevant data. The frontend's WebSocket hook parses incoming messages, dispatches them to the appropriate Zustand store, and optionally invalidates TanStack Query caches.

The event types for Phase 1 are: agent_status_change (payload includes agent ID and new status), task_created (payload includes the full task object), task_updated (payload includes task ID and changed fields), task_completed (payload includes task ID, output summary, cost, and duration), task_failed (payload includes task ID and error message), log_entry (payload includes the full log entry object), alert_triggered (payload includes the full alert object), and cost_update (payload includes the new cost record and updated agent total).

The frontend implements reconnection logic with exponential backoff. On disconnect, it waits 1 second before the first retry, then doubles the wait on each subsequent failure up to a maximum of 30 seconds. A connection status indicator in the sidebar shows green when connected, amber when reconnecting, and red when disconnected for more than 60 seconds.

### 2.9 Developer Experience

Getting the project running should take one command. After cloning the repository and copying .env.example to .env, running docker-compose up builds and starts all three containers: PostgreSQL, the backend, and the frontend. The backend container runs Alembic migrations on startup and then checks if the database is empty. If empty, it runs the seed script.

The seed script creates a realistic demo environment: 6 agents with varied types (a researcher, a writer, a coder, an analyst, a manager, and a utility agent), each with a different LLM model configured. It creates 30-50 historical tasks distributed across agents with realistic statuses (mostly completed, a few failed, a couple still running). It generates 200-300 log entries across those tasks with appropriate levels and messages. It creates cost records reflecting realistic token usage and pricing for each task. It generates a few alerts (one cost warning, one agent offline event) to populate the alerts system. This ensures the dashboard looks rich and functional from the very first page load.

The Makefile (or scripts/ directory) provides common commands: make setup (install dependencies and configure environment), make dev (start Docker Compose in development mode), make migrate (run Alembic migrations), make seed (run the seed script), make test (run backend and frontend tests), make lint (run linters), and make clean (tear down containers and volumes).

API documentation is automatically available at /docs (Swagger UI) and /redoc (ReDoc) via FastAPI's built-in OpenAPI support. No manual documentation maintenance is required for the API surface.

The .env.example file contains all configuration variables with sensible defaults and comments: DATABASE_URL, CORS_ORIGINS, HEARTBEAT_TIMEOUT_SECONDS, COST_ALERT_DAILY_THRESHOLD, COST_ALERT_MONTHLY_THRESHOLD, ERROR_RATE_THRESHOLD, LOG_LEVEL, and any future API keys.

---

## 3. Phase 2 — Enhanced Visualization and Management

Goal: Add the visual office layout, agent hierarchy, advanced analytics, and a basic workflow automation engine. This phase transforms Mission Control from a monitoring tool into an active management platform.

### 3.1 Visual Office Map

The visual office is an SVG-based interactive representation of agents positioned in a virtual workspace. This is not pixel art — it uses clean, scalable SVG graphics that are lightweight and render crisply at any resolution. The style is a simplified top-down or isometric view with flat colors and clean lines, consistent with the dark theme palette.

The office is a single SVG component divided into zones: a Main Floor (open plan area with desks), a Management Area (separate section for manager agents), a Break Room (where idle agents sit), and a Server Room (visual representation of system infrastructure). Each zone has a subtle background fill and a label.

Each agent is represented by a small SVG avatar positioned at a desk within the appropriate zone. Working agents sit at their desks with a subtle CSS typing animation (a small element that bobs up and down near their hands). Idle agents sit at their desks with no animation. Agents in error state have a red glow effect around their avatar. Offline agents are rendered with reduced opacity and a greyscale filter.

Hovering over an agent shows a tooltip with the agent name, current status, current task (if working), and uptime. Clicking an agent opens their detail panel, the same one from the Agents page.

Agents can be dragged to different desk positions to organize the office layout. Desk assignments persist in the database via a new position field on the Agent model (storing x,y coordinates and zone).

The office map is a new top-level page accessible from the sidebar, positioned below the Command Center. It can also be embedded as a compact widget on the Command Center dashboard in a future iteration.

### 3.2 Agent Hierarchy and Organization

A new tree view component shows agent relationships. Manager agents appear at the top with worker agents nested below them. The hierarchy is defined by an optional parent_agent_id field on the Agent model. An agent with no parent is either a top-level worker or a manager.

Agents can be grouped into teams with a new AgentGroup model containing: id, name, description, and color (for visual identification). Agents gain an optional group_id foreign key. The Agents page adds a "Group by team" toggle that clusters agents by their group.

Delegation chains define which agents can assign tasks to which other agents. This is stored as a simple allow-list on the manager agent's configuration. The workflow engine in section 3.4 uses these chains to validate automated task routing.

### 3.3 Advanced Analytics

The Cost and Analytics page is expanded with new visualizations and deeper analysis.

Token Usage Trends shows input and output token counts over time as a stacked area chart, with the ability to filter by agent or model. Model Comparison presents a table and chart comparing cost-per-token, average response time, and error rates across different LLM models used by agents. Task Success and Failure Rates shows a per-agent breakdown of completed vs failed tasks as percentage bars. Average Task Duration Trends displays a line chart of mean task duration over time, filterable by agent and task type. Performance Scoring assigns each agent a simple score based on completion rate, average speed, and cost efficiency, displayed as a ranked leaderboard.

All charts support export to PNG. The page also includes an "Export Report" button that generates a PDF or CSV containing all analytics data for the selected period.

### 3.4 Workflow Engine

The workflow engine allows defining simple automation chains without code. A workflow is a sequence of steps where the completion of one task can trigger the creation of the next.

The Workflow model contains: id, name, description, steps (JSON array defining the chain), is_active (boolean), created_at, and last_run_at. Each step defines: the agent to assign, a task template (title, description, input mapping), conditions for execution (always, or only if previous step's output matches a pattern), and an optional delay before execution.

The simplest use case is a linear chain: Agent A completes research, which triggers Agent B to write a draft based on Agent A's output. More advanced use cases include conditional routing: if Agent A's output contains a certain keyword, route to Agent B; otherwise route to Agent C.

A visual workflow builder page allows creating workflows by dragging nodes (representing task steps) onto a canvas and connecting them with edges. Each node is configured with an agent selection, task template, and conditions. This uses a simple node-edge model — no need for a full diagramming library; a lightweight custom implementation or a small library like reactflow is sufficient.

Workflows can be saved as templates and triggered manually or by API call.

### 3.5 Notifications and Alerts v2

The notification system is upgraded from Phase 1's basic alert engine to a full notification center. A bell icon in the header bar shows a badge count of unacknowledged alerts. Clicking it opens a dropdown panel listing recent alerts with severity coloring, timestamps, and a "Mark as read" button.

Alert rules become fully configurable through the Settings page. Each rule has a name, a condition type (cost threshold, error rate, agent offline, custom metric), parameters (threshold values, time windows), a severity level, and enabled/disabled toggle.

Outbound notification channels are added: Webhook (POST a JSON payload to any configured URL when an alert triggers), Email (send via SMTP with configurable server settings), and in-app (the default, always active).

An Alert History page shows all past alerts in a searchable, filterable table with timestamps, types, severity, whether they were acknowledged, and by whom.

### 3.6 Document and Knowledge Base

A file storage system allows uploading documents that can be associated with agents, tasks, or exist globally as shared knowledge. Files are stored on the local filesystem in a configurable directory with metadata tracked in the database.

Each agent and each task gains a "Notes" tab where Markdown notes can be written and saved. This supports the "second brain" concept — agents can store findings, research summaries, and context that persists across tasks.

A Knowledge Base page provides a unified view of all documents and notes with full-text search. Documents can be tagged and categorized. The search indexes document content, agent notes, and task outputs.

---

## 4. Phase 3 — Social Feeds and External Integrations

Goal: Add TweetDeck-style social monitoring, a content creation pipeline, and integrations with external tools.

### 4.1 Social Feed Panel

A new page provides a multi-column social feed layout inspired by TweetDeck. Each column represents a feed source and can be added, removed, reordered, and resized.

Supported feed types include: RSS/Atom (any URL — this is the most reliable and universally available), Reddit (subreddit feeds via the JSON API), Hacker News (top/new/best stories via the Algolia API), and Twitter/X (if API access is available and affordable; otherwise this is deprioritized in favor of the other sources).

Each column auto-refreshes on a configurable interval, supports keyword filtering, and tracks read/unread state. Items can be bookmarked or sent to an agent for processing (e.g., "Research this topic further").

A Content Queue sub-section allows agents to draft social media posts or content pieces. Drafts appear in a review queue where a human can edit, approve, reject, or schedule them. Approved posts can be published directly if API credentials are configured, or simply marked as approved for manual posting.

### 4.2 Content Intelligence Pipeline

This feature connects agents into a content creation workflow: one agent researches a topic, another generates a content draft, a human reviews and edits it, and the final version is published or stored.

A Content Calendar view displays scheduled and published content on a monthly/weekly calendar. Each content piece tracks its pipeline stage: research, drafting, review, approved, published.

Optional integrations include SEO analysis (basic keyword density and readability scoring built in, with hooks for external SEO APIs) and competitor content monitoring (via RSS feeds of competitor blogs or publication channels).

### 4.3 External Integrations

Each integration is implemented as a backend service module with configuration stored in the Settings page.

GitHub integration monitors repository activity, surfaces new pull requests and issues as items in the activity feed, and allows agents to be triggered by GitHub webhooks (e.g., a new issue triggers a research agent to analyze it).

Slack integration sends alert notifications and daily summary reports to configured Slack channels via incoming webhooks.

Google Calendar integration syncs task deadlines and scheduled workflow runs to a Google Calendar, and can trigger tasks based on calendar events.

Notion integration provides two-way document synchronization between Mission Control's knowledge base and a Notion workspace.

A generic Webhook system supports both incoming webhooks (external services POST to Mission Control to trigger actions) and outgoing webhooks (Mission Control POSTs to external URLs when events occur). This serves as the universal integration point for any service not explicitly supported.

### 4.4 Multi-User Support

User accounts are added with email/password authentication. Two roles exist: admin (full access to all features, settings, and agent management) and viewer (read-only access to dashboards, logs, and analytics).

An Audit Log tracks all user actions: agent registration, task creation, configuration changes, alert acknowledgments, and data exports. Each entry records the user, action, target resource, timestamp, and any changed values.

Agent configurations can be marked as shared (visible to all users) or private (visible only to the creator). This allows teams to use the same Mission Control instance while maintaining personal agent setups.

---

## 5. Phase 4 — Future Vision

These features represent the long-term direction and are not scoped in detail. They serve as guideposts for architectural decisions made in earlier phases.

AI-powered anomaly detection would use statistical analysis or a lightweight ML model to detect unusual agent behavior patterns — sudden cost spikes, unexpected error clusters, or performance degradation — and surface them proactively.

Auto-scaling suggestions would analyze workload patterns and recommend when to spin up additional agent instances or redistribute tasks across agents for better throughput.

Voice control would add speech recognition to the dashboard, allowing hands-free commands like "Show me Agent Alpha's cost this week" or "Pause all research agents."

Mobile responsive design and Progressive Web App support would make Mission Control usable on tablets and phones, with push notifications for critical alerts.

A plugin system would define a standard interface for community-built extensions: custom agent type icons, new chart types, additional integration connectors, and theme packs.

Multi-instance federation would allow connecting multiple Mission Control instances across different machines or networks, aggregating data from distributed agent deployments into a single view.

A full pixel art office theme would be offered as an optional visual upgrade, replacing the clean SVG office with a detailed pixel art isometric environment including animated characters, furniture, and ambient effects.

---

## 6. Appendix A: Tech Stack Summary

Backend: Python 3.11+, FastAPI, SQLAlchemy (async), Alembic, Pydantic v2, uvicorn, websockets, httpx, APScheduler.

Frontend: React 18, Vite, TypeScript, TailwindCSS, Zustand, TanStack Query (React Query v5), React Router v6, Recharts, Lucide React (icons, supplemented by custom SVGs).

Database: PostgreSQL 15+ for production and standard usage, SQLite as a fallback for quick development without Docker.

DevOps: Docker, Docker Compose, Makefile.

Testing: pytest and pytest-asyncio for the backend, Vitest and React Testing Library for the frontend.

---

## 7. Appendix B: Project Directory Structure

mission-control/
  backend/
    app/
      main.py
      config.py
      database.py
      routers/
        agents.py
        tasks.py
        logs.py
        costs.py
        metrics.py
        websocket.py
        health.py
      models/
        agent.py
        task.py
        log.py
        cost.py
        alert.py
      schemas/
        agent.py
        task.py
        log.py
        cost.py
        alert.py
      services/
        heartbeat_monitor.py
        cost_aggregator.py
        alert_engine.py
        websocket_manager.py
      middleware/
        cors.py
        logging.py
    alembic/
      versions/
      env.py
      alembic.ini
    tests/
      test_agents.py
      test_tasks.py
      test_logs.py
      test_costs.py
      test_websocket.py
      conftest.py
    requirements.txt
    Dockerfile
  frontend/
    src/
      main.tsx
      App.tsx
      api/
        client.ts
        agents.ts
        tasks.ts
        logs.ts
        costs.ts
        websocket.ts
      store/
        useAgentStore.ts
        useTaskStore.ts
        useLogStore.ts
        useCostStore.ts
        useWebSocketStore.ts
      pages/
        Dashboard.tsx
        Agents.tsx
        AgentDetail.tsx
        Tasks.tsx
        TaskDetail.tsx
        Logs.tsx
        Costs.tsx
        Settings.tsx
      components/
        layout/
          Sidebar.tsx
          Header.tsx
          MainLayout.tsx
        agents/
          AgentCard.tsx
          AgentGrid.tsx
          AgentStatusDot.tsx
          RegisterAgentForm.tsx
        tasks/
          TaskList.tsx
          TaskCard.tsx
          CreateTaskForm.tsx
        logs/
          LogStream.tsx
          LogEntry.tsx
          LogFilters.tsx
        costs/
          CostOverview.tsx
          CostChart.tsx
          BudgetSettings.tsx
        common/
          StatusBadge.tsx
          LoadingSpinner.tsx
          EmptyState.tsx
          SVGIcons.tsx
      hooks/
        useWebSocket.ts
        useAgents.ts
        useTasks.ts
      styles/
        globals.css
      types/
        index.ts
    tailwind.config.js
    vite.config.ts
    tsconfig.json
    package.json
    Dockerfile
  docker-compose.yml
  Makefile
  README.md
  .env.example
  .gitignore
  docs/
    api.md
    setup.md
    architecture.md
  scripts/
    seed.py
    reset_db.py

---

## 8. Appendix C: API Quick Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/agents/register | Register a new agent |
| GET | /api/agents | List all agents with status |
| GET | /api/agents/{id} | Get agent detail with recent activity |
| PATCH | /api/agents/{id}/status | Update agent status |
| POST | /api/agents/{id}/heartbeat | Agent heartbeat ping |
| POST | /api/tasks | Create a new task |
| GET | /api/tasks | List tasks with filters |
| GET | /api/tasks/{id} | Get task detail with logs and trace |
| PATCH | /api/tasks/{id} | Update task status or result |
| POST | /api/tasks/{id}/logs | Append log entry to task |
| GET | /api/logs | Global log stream with filters |
| GET | /api/costs/summary | Cost overview for period |
| GET | /api/costs/daily | Daily cost breakdown time series |
| GET | /api/metrics | System metrics overview |
| GET | /api/health | Health check |
| WS | /ws/events | Real-time event stream |

All REST endpoints return JSON. All accept JSON request bodies where applicable. Pagination is handled via "skip" and "limit" query parameters with sensible defaults (skip=0, limit=50). Filters are passed as query parameters. Error responses follow a consistent shape: { "detail": "error message" } with appropriate HTTP status codes.

---

## 9. Appendix D: WebSocket Events Reference

| Event Name | Direction | Payload Description |
|------------|-----------|---------------------|
| agent_status_change | server to client | agent_id, previous_status, new_status, timestamp |
| task_created | server to client | Full task object as created |
| task_updated | server to client | task_id, changed fields with new values |
| task_completed | server to client | task_id, output summary, total_cost, duration_seconds |
| task_failed | server to client | task_id, error_message, duration_seconds |
| log_entry | server to client | Full log entry object |
| alert_triggered | server to client | Full alert object |
| cost_update | server to client | New cost record, updated agent total_cost |
| ping | client to server | Empty payload, keepalive |
| pong | server to client | Empty payload, keepalive response |

All messages are JSON objects with a top-level "type" field matching the event name, a "timestamp" field in ISO 8601 format, and a "payload" field containing the event-specific data.

---

## 10. Appendix E: Database Schema Overview

Table: agents
  id — UUID, primary key
  name — VARCHAR(255), unique, not null
  type — VARCHAR(100), not null
  status — VARCHAR(20), not null, default "idle"
  capabilities — JSONB, default empty array
  model — VARCHAR(255), nullable
  created_at — TIMESTAMP WITH TIME ZONE, not null, default now
  last_heartbeat — TIMESTAMP WITH TIME ZONE, nullable
  total_tasks — INTEGER, not null, default 0
  total_cost — DECIMAL(12,4), not null, default 0.0
  config — JSONB, default empty object

Table: tasks
  id — UUID, primary key
  agent_id — UUID, foreign key to agents(id), not null
  title — VARCHAR(500), not null
  description — TEXT, nullable
  status — VARCHAR(20), not null, default "queued"
  priority — VARCHAR(20), not null, default "medium"
  input — JSONB, default empty object
  output — JSONB, nullable
  cost — DECIMAL(12,4), not null, default 0.0
  tokens_used — INTEGER, not null, default 0
  started_at — TIMESTAMP WITH TIME ZONE, nullable
  completed_at — TIMESTAMP WITH TIME ZONE, nullable
  created_at — TIMESTAMP WITH TIME ZONE, not null, default now
  error_message — TEXT, nullable

Table: log_entries
  id — UUID, primary key
  task_id — UUID, foreign key to tasks(id), nullable
  agent_id — UUID, foreign key to agents(id), not null
  level — VARCHAR(10), not null
  message — TEXT, not null
  timestamp — TIMESTAMP WITH TIME ZONE, not null, default now
  metadata — JSONB, nullable

Table: cost_records
  id — UUID, primary key
  agent_id — UUID, foreign key to agents(id), not null
  task_id — UUID, foreign key to tasks(id), nullable
  model — VARCHAR(255), not null
  input_tokens — INTEGER, not null, default 0
  output_tokens — INTEGER, not null, default 0
  cost_usd — DECIMAL(12,4), not null
  timestamp — TIMESTAMP WITH TIME ZONE, not null, default now

Table: alerts
  id — UUID, primary key
  type — VARCHAR(100), not null
  severity — VARCHAR(20), not null
  message — TEXT, not null
  agent_id — UUID, foreign key to agents(id), nullable
  task_id — UUID, foreign key to tasks(id), nullable
  acknowledged — BOOLEAN, not null, default false
  created_at — TIMESTAMP WITH TIME ZONE, not null, default now

Indexes: agents(status), agents(last_heartbeat), tasks(agent_id), tasks(status), tasks(created_at), log_entries(agent_id), log_entries(task_id), log_entries(timestamp), log_entries(level), cost_records(agent_id), cost_records(timestamp), alerts(severity), alerts(acknowledged), alerts(created_at).

---

## 11. Appendix F: Color System Reference

| Token Name | Hex Value | CSS Variable | Usage |
|------------|-----------|-------------|-------|
| bg-deepest | #0a0a0f | --color-bg-deepest | Page body background |
| bg-panel | #12121a | --color-bg-panel | Sidebar, panel backgrounds |
| bg-card | #1a1a2e | --color-bg-card | Cards, elevated surfaces |
| bg-hover | #16213e | --color-bg-hover | Hover states on interactive cards |
| accent-success | #00ff88 | --color-accent-success | Active, healthy, online, success |
| accent-error | #ff4444 | --color-accent-error | Error, critical, failure, offline |
| accent-warning | #ffaa00 | --color-accent-warning | Warning, caution, degraded |
| accent-info | #4ecdc4 | --color-accent-info | Informational, secondary actions |
| accent-highlight | #a855f7 | --color-accent-highlight | Special highlights, unique states |
| text-primary | #ffffff | --color-text-primary | Headings, important data values |
| text-secondary | #94a3b8 | --color-text-secondary | Body text, descriptions |
| text-muted | #64748b | --color-text-muted | Timestamps, labels, de-emphasized |
| border-default | #1e293b | --color-border-default | Borders, dividers, separators |

These tokens are defined as CSS custom properties on :root in globals.css and extended into the Tailwind configuration via the theme.extend.colors object. All component styling references these tokens exclusively — no hardcoded color values in components.

---

End of document.