---
name: user-story-craft
description: "Use when writing user stories, defining acceptance criteria, creating epics, or building product backlogs. Produces developer-ready stories with testable criteria and implementation guidance."
---

# User Story Crafting

Write user stories that developers love and QA can verify.

## Trigger Conditions

Use this skill when:
- User needs user stories or acceptance criteria
- Breaking down a feature or epic into implementable chunks
- Defining requirements for a sprint or milestone
- Translating business goals into development tasks

## Story Template

```markdown
## Epic: [Business Capability Name]

### Story [N]: [Short descriptive title]

**As a** [specific persona — not just "user", be precise about who]
**I want to** [specific action with enough context to understand the intent]
**So that** [measurable business/user outcome — not vague "better experience"]

#### Acceptance Criteria

**Happy Path:**
- Given [precondition], when [user action], then [expected system response]
- Given [precondition], when [user action], then [expected UI state]

**Edge Cases:**
- Given [error condition], when [action], then [graceful handling]
- Given [empty state], when [first use], then [onboarding behavior]
- Given [concurrent users], when [simultaneous action], then [conflict resolution]

**Performance:**
- Page/component loads in < [X]ms
- API response in < [X]ms at P99
- Works offline/degraded: [yes/no and behavior]

**Analytics:**
- Track: [specific event names and properties]
- Success metric: [what number proves this story worked]

#### Priority & Sizing

- **Priority**: P[0-3] — [one sentence justification tied to business value]
- **Effort**: [S/M/L/XL] — [what makes this simple or complex]
- **Dependencies**: [stories/systems that must exist first]
- **Risks**: [what could go wrong, how to mitigate]

#### Implementation Notes

- [Specific technical approach recommendation]
- [Relevant API contracts or data models]
- [Common pitfalls to avoid]
- [Reference to existing patterns in the codebase if applicable]
```

## Principles

1. **One story = one testable behavior.** If you can't write a single test for it, split it.
2. **Acceptance criteria are binary.** Pass or fail, no "sort of works."
3. **Include the unhappy path.** What happens when things break?
4. **Size by uncertainty, not just effort.** A small task with unknowns is larger than a big task you've done before.
5. **Dependencies are risks.** Flag them loudly.
6. **Analytics from day one.** If you can't measure it, you can't prove it worked.
