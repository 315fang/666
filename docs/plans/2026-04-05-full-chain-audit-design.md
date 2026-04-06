# Full Chain Audit Design

## Goal

Build a full-project, evidence-based chain audit for this repository, with progressive detail and parallel subagent checks across all key business paths.

## Scope

- Transaction chain: login -> product discovery -> cart -> order -> payment callback -> fulfillment.
- Distribution chain: invite/binding -> team relation -> commission generation/settlement -> withdrawal.
- Operations config chain: admin configuration -> backend aggregation APIs -> miniprogram rendering.
- Agent portal chain: portal auth -> workbench/wallet -> order/stats linkage.
- Skill/governance chain: repository skills vs actual code path consistency.

## Constraints

- Static + key command verification first (broad and fast).
- Runtime code is source of truth when docs conflict.
- Outputs must include concrete evidence (file locations + command output references).

## Approach

### 1) Baseline Map First

Create one shared map of:

- Backend route mounts and path prefixes.
- Frontend API base/proxy/env entry points.
- Cross-end auth boundaries and token systems.

This prevents duplicated or contradictory findings from later parallel analysis.

### 2) Parallel Subagent Audits by Independent Domains

Run independent subagents for:

1. Transaction chain
2. Distribution/commission chain
3. Operations config chain
4. Agent portal chain + skill drift

Each subagent returns the same structure:

- Chain topology
- Evidence (files and key commands)
- Issues with severity (P0/P1/P2)
- Minimal-fix suggestions
- Blockers/unknowns

### 3) Central Consolidation

Main agent merges all findings and resolves duplicates/conflicts using this precedence:

1. Runtime route/config source files
2. Service/controller call paths
3. Documentation statements

## Risk Grading

- P0: Release-blocking (payment, auth bypass, money/stock consistency, core route break)
- P1: High risk drift (path mismatch, config mismatch, partial chain failure)
- P2: Non-blocking but important hygiene/document drift

## Deliverables

1. Unified chain topology (all 4 business chains + governance chain)
2. Risk ledger with evidence and priority
3. Skill drift report against repo skills
4. Prioritized remediation path (24h / 3-day / next iteration)

## Acceptance

Audit is complete only when all are true:

- All four chains analyzed with evidence
- Skill/governance drift analyzed
- Findings consolidated with no unresolved duplicate conflicts
- Each issue has severity + minimal fix direction
