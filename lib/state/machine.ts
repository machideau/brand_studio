/**
 * lib/state/machine.ts — Project state machine
 *
 * Defines valid states, transitions, and the StateMachine class.
 * Validates transitions before updating the database.
 * Logs each transition without exposing sensitive data.
 *
 * Requirements: 18.1, 18.2, 18.3
 */

import { getProject, updateProjectState } from "@/lib/db/queries/projects";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectState =
  | "RECEIVED"
  | "VALIDATING"
  | "ANALYZING"
  | "STRATEGY_READY"
  | "GENERATING"
  | "COMPOSING"
  | "QA_RUNNING"
  | "REVISION_REQUIRED"
  | "EXPORTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ProjectTransition =
  | "START_VALIDATION"
  | "FILE_VALID"
  | "FILE_INVALID"
  | "ANALYSIS_DONE"
  | "ANALYSIS_FAILED"
  | "PLAN_READY"
  | "GENERATION_DONE"
  | "COMPOSITION_DONE"
  | "QA_PASS"
  | "QA_FAIL"
  | "REVISION_DONE"
  | "MAX_RETRIES"
  | "EXPORT_DONE"
  | "EXPORT_FAILED"
  | "CANCEL";

// ---------------------------------------------------------------------------
// Transition table (derived from the design.md state diagram)
// ---------------------------------------------------------------------------

/**
 * For each state, the set of transitions that are explicitly allowed.
 * Any transition not listed here is forbidden and will raise an error.
 */
export const ALLOWED_TRANSITIONS: Record<ProjectState, ProjectTransition[]> = {
  RECEIVED: ["START_VALIDATION", "CANCEL"],
  VALIDATING: ["FILE_VALID", "FILE_INVALID", "CANCEL"],
  ANALYZING: ["ANALYSIS_DONE", "ANALYSIS_FAILED", "CANCEL"],
  STRATEGY_READY: ["PLAN_READY", "CANCEL"],
  GENERATING: ["GENERATION_DONE", "CANCEL"],
  COMPOSING: ["COMPOSITION_DONE", "CANCEL"],
  QA_RUNNING: ["QA_PASS", "QA_FAIL", "CANCEL"],
  REVISION_REQUIRED: ["REVISION_DONE", "MAX_RETRIES", "CANCEL"],
  EXPORTING: ["EXPORT_DONE", "EXPORT_FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

// ---------------------------------------------------------------------------
// Transition → next-state map
// ---------------------------------------------------------------------------

/**
 * Maps a (currentState, transition) pair to the resulting state.
 * Expressed as a nested record for type safety and exhaustiveness.
 */
const NEXT_STATE: Partial<
  Record<ProjectState, Partial<Record<ProjectTransition, ProjectState>>>
> = {
  RECEIVED: {
    START_VALIDATION: "VALIDATING",
    CANCEL: "CANCELLED",
  },
  VALIDATING: {
    FILE_VALID: "ANALYZING",
    FILE_INVALID: "FAILED",
    CANCEL: "CANCELLED",
  },
  ANALYZING: {
    ANALYSIS_DONE: "STRATEGY_READY",
    ANALYSIS_FAILED: "FAILED",
    CANCEL: "CANCELLED",
  },
  STRATEGY_READY: {
    PLAN_READY: "GENERATING",
    CANCEL: "CANCELLED",
  },
  GENERATING: {
    GENERATION_DONE: "COMPOSING",
    CANCEL: "CANCELLED",
  },
  COMPOSING: {
    COMPOSITION_DONE: "QA_RUNNING",
    CANCEL: "CANCELLED",
  },
  QA_RUNNING: {
    QA_PASS: "EXPORTING",
    QA_FAIL: "REVISION_REQUIRED",
    CANCEL: "CANCELLED",
  },
  REVISION_REQUIRED: {
    REVISION_DONE: "QA_RUNNING",
    MAX_RETRIES: "FAILED",
    CANCEL: "CANCELLED",
  },
  EXPORTING: {
    EXPORT_DONE: "COMPLETED",
    EXPORT_FAILED: "FAILED",
  },
  COMPLETED: {},
  FAILED: {},
  CANCELLED: {},
};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class InvalidTransitionError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly fromState: ProjectState,
    public readonly transition: ProjectTransition,
  ) {
    super(
      `Invalid transition '${transition}' from state '${fromState}' for project '${projectId}'`,
    );
    this.name = "InvalidTransitionError";
  }
}

export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`Project '${projectId}' not found`);
    this.name = "ProjectNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// StateMachine class
// ---------------------------------------------------------------------------

export class StateMachine {
  /**
   * Apply a transition to the project identified by `projectId`.
   *
   * 1. Reads the current state from the database.
   * 2. Validates the transition against ALLOWED_TRANSITIONS.
   * 3. Writes the new state to the database.
   * 4. Logs the transition.
   *
   * @param projectId   UUID of the project.
   * @param transition  The transition to apply.
   * @param inngestStepId  Identifier of the Inngest step triggering this transition
   *                       (use 'manual' for bot-initiated transitions such as /cancel).
   * @returns The new ProjectState.
   * @throws  InvalidTransitionError if the transition is not allowed.
   * @throws  ProjectNotFoundError   if the project does not exist.
   */
  async apply(
    projectId: string,
    transition: ProjectTransition,
    inngestStepId: string = "manual",
  ): Promise<ProjectState> {
    const project = await getProject(projectId);

    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    const currentState = project.state as ProjectState;
    const allowed = ALLOWED_TRANSITIONS[currentState];

    if (!allowed.includes(transition)) {
      log.error("State transition rejected", {
        projectId,
        step: inngestStepId,
        error: {
          code: "INVALID_TRANSITION",
          operation: `${currentState} → ${transition}`,
        },
      });
      throw new InvalidTransitionError(projectId, currentState, transition);
    }

    const nextState = NEXT_STATE[currentState]?.[transition];

    if (!nextState) {
      // This should never happen if ALLOWED_TRANSITIONS and NEXT_STATE are in sync,
      // but guard defensively.
      throw new Error(
        `[state/machine] Missing NEXT_STATE mapping for ${currentState} + ${transition}`,
      );
    }

    await updateProjectState(projectId, nextState);

    log.info("State transition applied", {
      projectId,
      step: inngestStepId,
    });

    return nextState;
  }

  /**
   * Return the current state of the project from the database.
   *
   * @throws ProjectNotFoundError if the project does not exist.
   */
  async current(projectId: string): Promise<ProjectState> {
    const project = await getProject(projectId);

    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    return project.state as ProjectState;
  }
}

/** Singleton instance for use across the application. */
export const stateMachine = new StateMachine();
