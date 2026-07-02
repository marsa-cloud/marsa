# Marsa Project Management Conventions

## Core Philosophy

- Keep process lightweight
- Optimize for solo-builder velocity
- Optimize for AI readability
- Avoid unnecessary PM ceremony

---

# GitHub Structure

## Project

Use a single GitHub Project for the entire Marsa roadmap.

Project name:

- Marsa Roadmap

---

## Milestones

Milestones represent delivery targets/releases.

Current milestones:

- Marsa V0.1
- Marsa V0.2
- Future

Do NOT create issues for releases/phases.

BAD:

- Issue: Marsa V0.1

GOOD:

- Milestone: Marsa V0.1

---

## Hierarchy

Use:

Milestone
→ Feature Issue
→ Task Issues

Example:

- Feature: Authentication
  - Task: Implement GitHub OAuth
  - Task: Add refresh token flow

### Linking Tasks to Features

Use GitHub **sub-issues** to attach Tasks to their parent Feature (Feature issue → "Add sub-issue"). This gives native progress tracking and survives reordering.

A Task issue inherits the labels of its parent Feature unless it genuinely belongs to a different area.

---

## Labels

Marsa keeps the label set small. The GitHub defaults (`bug`, `documentation`, `enhancement`, `question`, `duplicate`, `invalid`, `wontfix`, `help wanted`, `good first issue`) plus a few custom ones:

- `Research` — spike / figure-out-the-options-first work
- `migration` — DB/schema/data migration (gated by `require-migration-ticket.sh`)
- `preview` — build a preview image for a PR (label-gated CD build)

### Priority

- P1 — important, schedule soon
- P2 — normal

---

## Workflow Status

Project statuses:

- Backlog — captured but not yet refined.
- Ready — refined and pickable: meets the AI Optimization bar below (clear goal, constraints, acceptance criteria, non-goals). Only move an issue here once it does.
- In Progress
- Blocked — add a comment stating what it's blocked on (and link the blocking issue/PR if there is one).
- Done

---

# Issue Writing Rules

## Titles

BAD:

- Auth

GOOD:

- Implement GitHub OAuth login

Use concise engineering-oriented wording.

Avoid Scrum/user-story phrasing such as:

- "As a user, I want..."

---

## Issue Template

Use this for **Feature** issues:

```md
## Goal

What are we trying to achieve?

## Requirements

- Requirement
- Requirement
- Requirement

## Acceptance Criteria

- Observable condition that means this is done
- ...

## Non-goals

Explicitly out of scope.

## Notes

Implementation notes/constraints.
```

A **Task** issue can be lighter — a one-line goal plus Acceptance Criteria is enough. Don't force the full template onto small tasks.

---

# Scoping Rules

Split large systems into separate features.

BAD:

- Deployment System

GOOD:

- Git Deployments
- Deployment Runtime
- Deployment Logs

---

# AI Optimization

Issues should contain:

- clear goals
- constraints
- acceptance criteria
- non-goals

This improves AI-assisted implementation quality significantly.
