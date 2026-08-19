import { TaskGraph } from '../../config/task-graph';

export const HASH_TASKS = 'HASH_TASKS' as const;

/**
 * Sentinel response returned when the daemon does not have the task graph for
 * the given taskGraphId (e.g. it restarted mid-run). The client re-sends the
 * message with the full task graph.
 */
export const TASK_GRAPH_NOT_REGISTERED = 'TASK_GRAPH_NOT_REGISTERED' as const;

export type HandleHashTasksMessage = {
  type: typeof HASH_TASKS;
  runnerOptions: any;
  taskIds: string[];
  /**
   * Identifies the task graph across HASH_TASKS messages of the same run.
   * The full task graph is only included the first time a given id is sent;
   * the daemon caches it so subsequent messages can omit it.
   */
  taskGraphId: string;
  taskGraph?: TaskGraph;
  perTaskEnvs: Record<string, NodeJS.ProcessEnv>;
  cwd: string;
  collectInputs?: boolean;
};
