# OpenClaw Swarm Architecture

**Purpose:** Enable parallel sub-agent execution for complex tasks like content generation, research, and multi-step workflows.

**Date:** 2026-02-20
**Status:** Gateway pairing issue blocking spawn; architecture ready for implementation once fixed

---

## Core Problem

The gateway is currently stuck in "pairing required" mode, preventing sub-agent spawns with error:
```
gateway closed (1008): pairing required
Gateway target: ws://127.0.0.1:18789
```

This blocks the `sessions_spawn` and `subagents` tools.

---

## Proposed Swarm Architecture

### 1. Agent Types (Roles)

#### **Orchestrator Agent** (Main Session)
- **Role:** Task distribution, result aggregation, quality control
- **Capabilities:** Full tool access, can spawn child agents
- **Responsibilities:**
  - Break down complex tasks into sub-tasks
  - Spawn specialized agents
  - Collect and synthesize results
  - Handle errors and retries
  - Maintain context across swarm

#### **Specialist Agents** (Sub-Agents)
- **Role:** Execute specific, focused tasks
- **Capabilities:** Limited tool access based on role
- **Lifespan:** Ephemeral; spawn, execute, report, die
- **Types:**
  - **Research Agent:** Web search, content extraction, data gathering
  - **Writer Agent:** Content generation, editing, style adaptation
  - **Code Agent:** Implementation, refactoring, debugging
  - **QA Agent:** Testing, validation, edge case identification
  - **Design Agent:** UI/UX feedback, visual consistency checks

#### **Aggregator Agent** (Optional)
- **Role:** Merge outputs from multiple specialists
- **Use case:** When results need blending (e.g., merge 5 persona outputs)
- **Capabilities:** Read-only access to other agents' outputs

---

### 2. Communication Patterns

#### **Pattern A: Parallel Map-Reduce**
```
Orchestrator spawns N agents with same task, different inputs
    ↓
Agent 1 → Result 1
Agent 2 → Result 2
Agent 3 → Result 3
    ↓
Orchestrator aggregates results
```

**Use case:** Generate devotionals in all 5 personas simultaneously; user picks favorite.

#### **Pattern B: Sequential Pipeline**
```
Orchestrator spawns Agent 1
    ↓
Agent 1 completes → passes result to Orchestrator
    ↓
Orchestrator spawns Agent 2 with Agent 1's output
    ↓
Agent 2 completes → passes result to Orchestrator
    ↓
...continue...
```

**Use case:** Research → Outline → Draft → Edit → Finalize

#### **Pattern C: Fan-Out with Aggregation**
```
Orchestrator spawns N agents with different specializations
    ↓
Research Agent → Data
Writer Agent → Draft
QA Agent → Validation
    ↓
Aggregator Agent blends into final output
    ↓
Orchestrator presents to user
```

**Use case:** Complex content generation with research-backed writing.

#### **Pattern D: Competitive Redundancy**
```
Orchestrator spawns 3 identical agents with same task
    ↓
Agent 1 → Result A
Agent 2 → Result B  
Agent 3 → Result C
    ↓
Orchestrator or human picks best result
```

**Use case:** Critical tasks where quality variance is high; pick best of 3.

---

### 3. Implementation for Unfold Devotionals

#### Swarm Workflow: "Generate Personalized Devotional Series"

```
┌─────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (Main Session)                                 │
│  Input: User profile, themes, day count                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┬──────────────┐
    ↓              ↓              ↓              ↓
┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Scripture│  │ Research │  │  Writer  │  │   QA     │
│ Agent   │  │  Agent   │  │  Agent   │  │  Agent   │
└────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │            │             │             │
     │  Passages  │   Context   │    Draft    │  Validation
     └───────────→└────────────→└────────────→└──────┬────┘
                                                     │
                          ┌──────────────────────────┘
                          ↓
              ┌─────────────────────┐
              │  Aggregator Agent   │
              │  (Blends outputs)   │
              └──────────┬──────────┘
                         │
                         ↓
              ┌─────────────────────┐
              │  Final Devotional   │
              │  Series (7 days)    │
              └─────────────────────┘
```

**Agent Specifications:**

| Agent | Task | Tools | Output |
|-------|------|-------|--------|
| Scripture Agent | Select relevant passages based on themes | web_search (Bible refs) | 7 scripture references |
| Research Agent | Gather theological context, quotes, insights | web_search | Contextual brief |
| Writer Agent | Generate devotional drafts using persona system | memory_get (personas), web_fetch | 7 day drafts |
| QA Agent | Check theological accuracy, engagement hooks | web_search (validation) | Validation report |
| Aggregator Agent | Blend into cohesive series with day-by-day flow | read (files) | Final series JSON |

---

### 4. Technical Requirements

#### Gateway Fixes Needed
1. **Pairing Protocol:** Fix WebSocket handshake between agent and gateway
2. **Port Management:** Ensure port 18789 is consistently available
3. **Session Locks:** Prevent stale lock files from blocking new spawns
4. **Error Recovery:** Auto-retry on transient gateway failures

#### Configuration Updates
```json
{
  "agents": {
    "defaults": {
      "subagents": {
        "maxConcurrent": 8,
        "spawnTimeout": 30000,
        "autoRetry": true,
        "retryAttempts": 3
      }
    }
  }
}
```

#### Monitoring
- Track spawn success/failure rates
- Measure inter-agent communication latency
- Log agent lifecycle (spawn → execute → complete)

---

### 5. Fallback Strategy (While Gateway is Broken)

**Current workaround:** Single-agent sequential execution
- Orchestrator does all work directly
- Slower but functional
- No parallelization benefits

**Implementation:** Already done in `devotional-personas.ts`
- Persona system ready
- Sequential generation in `devotional-service.ts`
- User can select persona in onboarding

---

### 6. Migration Path to Full Swarm

**Phase 1:** ✅ Complete (Persona framework, single-agent generation)

**Phase 2:** Fix gateway pairing issue
```bash
# Manual fix steps
openclaw gateway stop
rm -f ~/.openclaw/agents/main/sessions/*.lock
openclaw gateway start --repair
```

**Phase 3:** Implement multi-persona parallel generation
- Spawn 5 writer agents simultaneously
- Each generates same devotional in different persona
- User picks favorite or system rotates

**Phase 4:** Full research-to-devotional pipeline
- Add Scripture Agent, Research Agent, QA Agent
- Fan-out pattern with aggregation
- Quality gates at each stage

**Phase 5:** Competitive generation for premium users
- Generate 3 versions of each devotional
- A/B test engagement metrics
- Automatically select best-performing

---

### 7. Success Metrics

| Metric | Current (Single) | Target (Swarm) |
|--------|-----------------|----------------|
| Devotional generation time | 25-30s | <10s (parallel) |
| Content variety per user | 1 persona | 5+ personas |
| Research depth | None | Auto scripture lookup |
| Quality validation | None | Automated QA pass |
| User engagement | Baseline | +20% completion |

---

### 8. Immediate Actions

**For Nick:**
1. Try manual gateway restart (commands above)
2. If still broken, consider OpenClaw reinstall
3. Test `sessions_spawn` with simple task

**For Yuki (Me):**
1. ✅ Implemented persona framework (ready for swarm)
2. Document fallback single-agent mode
3. Prepare swarm scripts for when gateway is fixed

---

## Summary

The swarm architecture is designed but blocked by gateway pairing. The persona framework is implemented and functional in single-agent mode. Once gateway is fixed, we can enable parallel devotional generation across all 5 personas simultaneously.

**Next milestone:** Gateway repair → Test spawn → Enable 5-persona parallel generation
