---
name: mvp-scoping
description: "Use when defining MVP scope, prioritizing features, cutting scope ruthlessly, or planning phased delivery. Produces clear MVP definitions with hypothesis, success metrics, and iteration paths."
---

# MVP Scoping & Feature Prioritization

Define what to build first and what to cut.

## Trigger Conditions

Use this skill when:
- Starting a new product or feature
- Scope is growing and needs to be cut
- User asks "what should we build first"
- Defining V1 vs V2 boundaries
- Prioritizing a backlog

## MVP Definition Template

```markdown
## MVP: [Product/Feature Name]

### Hypothesis
We believe that [target user] will [desired behavior] 
because [reason/insight], which will result in [measurable outcome].

### Success Metrics (must define BEFORE building)
- Primary: [the ONE number that proves the hypothesis]
- Secondary: [2-3 supporting metrics]
- Failure signal: [what number means we should pivot]

### In Scope (Must Have)
[Only features that directly test the hypothesis]
1. [Feature] — because [why it's essential for the hypothesis]
2. [Feature] — because [why it's essential]

### Out of Scope (Cut Ruthlessly)
[Everything else, with clear reasoning]
- [Feature] — defer because [why it can wait]
- [Feature] — defer because [nice but not hypothesis-critical]

### Technical Minimum
- [Minimum viable tech stack — simplest thing that works]
- [What can be manual/hacky in V1 vs. automated later]
- [Integration requirements — only what's essential]

### Iteration Path
- **MVP** (Week 1-2): [core hypothesis test]
- **V1** (Week 3-4): [based on MVP learnings, add X]
- **V2** (Week 5-8): [scale what worked, cut what didn't]
```

## RICE Prioritization Framework

For each feature, score:
- **Reach**: How many users per quarter? [number]
- **Impact**: How much does each user benefit? [0.25 / 0.5 / 1 / 2 / 3]
- **Confidence**: How sure are we about reach and impact? [0-100%]
- **Effort**: Person-weeks to implement [number]

**Score = (Reach x Impact x Confidence) / Effort**

Sort by score. Top items go in MVP, rest go in V1/V2 backlog.

## Cutting Principles

1. **If it doesn't test the hypothesis, cut it.** No exceptions.
2. **If you can validate with a fake door test, don't build it yet.**
3. **If it can be manual for 100 users, automate at 1000.**
4. **Polish is V2. Function is V1. Hypothesis-testing is MVP.**
5. **Every feature you add delays learning. Speed of learning > feature count.**
