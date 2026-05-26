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

- Marsa

---

## Milestones

Milestones represent delivery targets/releases.

Examples:

- Init
- v0.1
- MVP
- Public Beta

Do NOT create issues for releases/phases.

BAD:

- Issue: Marsa v0.1

GOOD:

- Milestone: v0.1

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

A Task issue inherits the `type:*` and `area:*` labels of its parent Feature unless it genuinely belongs to a different area.

---

## Labels

### Type

- type:feature
- type:bug
- type:refactor
- type:docs
- type:research

### Area

- area:auth
- area:deployments
- area:runtime
- area:database
- area:dashboard
- area:cli
- area:networking

### Priority

- P0
- P1
- P2

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
