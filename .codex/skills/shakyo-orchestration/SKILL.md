---
name: shakyo-orchestration
description: Use this skill in the shakyo repository when coordinating AGENTS.md workflow rules, PLAN.md product scope, subagents, or the .codex/agents role split for Explore/Plan/Build/Verify/Integrate work.
---

# shakyo Orchestration

Use this skill when working in the `shakyo` repository and the user asks for subagent orchestration, repository workflow, implementation coordination, or role-specific agent behavior.

Treat `PLAN.md` as the canonical product plan and `AGENTS.md` as the workflow and project guide. If this skill differs from local files, follow the local primary sources.

## Repository Baseline

- Purpose: a programming code 写経 learning web app for typing along with a reference.
- Stack: Vite + React + TypeScript static frontend, CodeMirror 6, pdf.js, and browser-direct OpenAI API calls.
- Commands: `npm install`, `npm run dev`, `npm run build`, `npm run lint`, `npm run test`.
- Future desktop direction: wrap the static frontend with Tauri later.

## Project Constraints

- Do not introduce server-side dependencies or server-only architecture.
- UI text must be Japanese.
- The user stores their OpenAI API key in `localStorage`; send it only to OpenAI API endpoints.
- Do not log, hardcode, commit, or place API keys in URLs.
- MVP excludes correctness judging, stats, and durable progress tracking.
- Do not add product features outside the current spec.

## Main Session Role

The main session is the orchestrator. It owns requirements, design, task decomposition, integration, and completion judgment. It does not implement code directly when subagent dispatch is available.

## Subagent Roles

- `explore`: read-only investigation agent using low reasoning and read-only sandbox. Use before implementation to read `AGENTS.md`, `PLAN.md`, relevant files, and return concise factual summaries with path:line evidence. Do not ask it to edit, plan implementation, or paste full files into the main context.
- `impl-worker`: normal implementation agent using medium reasoning and workspace-write sandbox. Use for finalized specs, focused tests, verification, and review-fix work.
- `hard-impl`: high-difficulty implementation agent using high reasoning and workspace-write sandbox. Use only for concurrency, ordering guarantees, distributed consistency, complexity-dominant algorithms, or fragile behavior-preserving changes.
- `reviewer`: independent read-only review agent using high reasoning and read-only sandbox. Use after implementation for spec compliance, shakyo constraints, security, maintainability, and test quality. It must not edit files.

## Workflow

1. Explore: dispatch `explore` before implementation. Request only the needed investigation scope. Bring back summaries, relevant paths, and evidence, not whole files.
2. Plan: turn exploration results into implementation tasks. Each task must have a concrete spec.
3. Build: dispatch each finalized spec to an implementation agent. Use `impl-worker` by default; use `hard-impl` only for its escalation conditions.
4. Verify: dispatch `reviewer` after implementation. Do not rely on the implementing agent for the independent review.
5. Integrate: compare all changes, review results, and test results against the specs. Do not declare completion until all acceptance criteria are satisfied.

## Spec Template

Every implementation task spec must include:

- Target files.
- Required changes.
- Acceptance criteria.
- Explicit non-goals and scope exclusions.
- Dependencies on other tasks.
- Whether the task can run in parallel, with the reason.

## Dispatch Rules

- Use one agent per task.
- Parallelize only tasks confirmed to be independent.
- Run dependent tasks serially.
- Escalate from `impl-worker` to `hard-impl` only for concurrency or ordering work, distributed consistency, complexity-dominant algorithms, or fragile behavior-preserving changes.
- If a spec is ambiguous or contradictory, stop and ask concrete questions instead of dispatching implementation.

## Review And Fix Loop

After `reviewer` reports findings, fold actionable feedback into the relevant spec. Send fixes back to `impl-worker`, unless the fix itself meets `hard-impl` escalation criteria. Repeat review and fix until Critical and Major findings are resolved or clearly accepted by the user.

## Completion Gate

Before reporting completion:

- Check each spec acceptance criterion against the actual files.
- Confirm review status and unresolved findings.
- Confirm relevant test commands and outcomes.
- Confirm no MVP scope creep or out-of-scope features were implemented.
- Confirm no server-side dependency was introduced.
- Confirm OpenAI API key handling remains local and leak-resistant.
- Report remaining blockers or residual risk if any condition cannot be satisfied.

## Prohibitions

- Do not dispatch implementation without a spec.
- Do not parallelize before dependencies are checked.
- Do not declare completion without independent review when review dispatch is available.
- Do not add scope outside the spec.
- Do not bring full exploration files into the main context when summaries are enough.
