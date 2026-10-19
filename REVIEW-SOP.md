# Unfold review SOP

Owner: Nick. Updated 2026-10-19 after his confirmation of the native-review workflow. Scope: Unfold app, backend, prototypes, scripts, and workflow documents.

## Review authority

Use two independent native reviewers for the final diff. External review services are not part of Unfold's workflow. This policy supersedes older external-review, knowledge-base and score requirements in nested checkouts, handoffs and inherited guidance. Shared doctrine and other projects remain unchanged.

## Ground the change in current source

Read the approved brief and applicable repository instructions, product/design records, and verification rules. Trace affected call sites and tests in the working tree. Treat old maps and past reviews as historical evidence. Verify claims against the source revision under review.

For app changes, preserve these invariants when relevant:

- Generation must reconcile or deliver before a devotional is ready.
- Premium access reads resolved entitlement.
- User writing survives editing, export, deletion, undo, and synchronization.
- Audio playback and voice capture share the device audio session.

## Independent adversarial review

After the change works, the orchestrator performs the required simplify pass. Run the relevant repository checks. Then use two separate reviewers, independent of the implementer. Keep reviews bounded to the change and affected behavior. Reviewers must try to disprove the change's safety and specification fidelity.

1. Give each reviewer the approved specification, immutable base and head, changed paths, and actual complete diff. Include uncommitted and untracked changes through a hashed snapshot when they belong to the candidate.
2. The specification reviewer checks requirements, correctness, regressions, state transitions, failure paths, and meaningful test coverage.
3. The standards reviewer checks security, privacy, authorization, architecture, simplicity, maintainability, and repository conventions.
4. Cover relevant UI, interaction, motion, accessibility, and device behavior across the reviews. Assign each concern explicitly. Record a reason when a concern does not apply.
5. Require concrete findings with severity, file and location, triggering scenario, impact, and evidence. Report blocked checks and missing evidence. A clean review must state its scope and limits.
6. Fix actionable findings. Rerun affected tests and return changed portions to the responsible reviewer. Record any owner-accepted exception explicitly.
7. Both reviewers assess the actual final combined diff. Pin its head and any working-tree snapshot. Earlier review of a different candidate is not final approval.

Report concrete findings rather than a numerical confidence score. Do not equate an agent review with Nick's visual approval or a required engineer's sign-off.

## Preserve publication and release gates

Required local checks, protected CI, unresolved-thread resolution, human approvals, and combined-tree verification remain required. Existing review comments still need disposition, including historical comments. Do not request another paid review to resolve them.

Never push main. Authorized pushes use the scoped galangster identity without exposing credentials. Commits and PR text use Nick's first person, without attribution or model names. An authorized merge must use squash and `--match-head-commit` against the reviewed head.

Production database writes, Railway changes, and merges of visible changes require Nick's explicit yes. Release and submission approval remain separate. Before App Review, run the release smoke required by AGENTS.md. Customer-facing release notes omit all AI changes.

Use FlowDeck for every simulator action. Never invoke xcodebuild, xcrun, simctl, devicectl, or the shell open command. Do not edit main checkouts. Implementation belongs in an authorized worktree under `.worktrees/`. Delete no branch, worktree, or simulator without approval of its named batch.

Never print, copy, log, or commit credentials, connection strings, reader IDs, or reader text. Use synthetic fixtures for review evidence.

## Evidence and propagation

Keep the final diff or snapshot, reviewer records, findings and fixes, test results, source pins, and remaining gates in the task record. Distinguish local verification, review, CI, merge, and deployment.

The orchestrator sends this policy to every worker it owns before further Unfold work. Each reviewer acknowledges the policy. Check inherited instructions, local scripts and hooks, repository configuration, and required CI checks against this policy. Keep unverified checks and unresolved findings explicit.
