import { Socket } from 'net';
import { TaskGraph } from '../../config/task-graph';
import { getCachedSerializedProjectGraphPromise } from './project-graph-incremental-recomputation';
import { InProcessTaskHasher } from '../../hasher/task-hasher';
import { readNxJson } from '../../config/configuration';
import { TASK_GRAPH_NOT_REGISTERED } from '../message-types/hash-tasks';

/**
 * We use this not to recreated hasher for every hash operation
 * TaskHasher has a cache inside, so keeping it around results in faster performance
 */
let storedProjectGraph: any = null;
let storedHasher: InProcessTaskHasher | null = null;

/**
 * Task graphs registered per client connection so subsequent HASH_TASKS
 * messages in the same run reference them by id instead of re-sending the
 * full graph. Scoped to the socket: entries are removed when the connection
 * closes (and the WeakMap lets them be GCed even if `close` never fires).
 */
const registeredTaskGraphs = new WeakMap<Socket, Map<string, TaskGraph>>();
const MAX_REGISTERED_TASK_GRAPHS_PER_CONNECTION = 4;

export function removeRegisteredTaskGraphs(socket: Socket): void {
  registeredTaskGraphs.delete(socket);
}

export async function handleHashTasks(
  payload: {
    runnerOptions: any;
    taskIds: string[];
    taskGraphId: string;
    taskGraph?: TaskGraph;
    perTaskEnvs: Record<string, NodeJS.ProcessEnv>;
    cwd: string;
    collectInputs?: boolean;
  },
  socket: Socket
) {
  let taskGraph: TaskGraph;
  if (payload.taskGraph) {
    taskGraph = payload.taskGraph;
    let graphsForConnection = registeredTaskGraphs.get(socket);
    if (!graphsForConnection) {
      graphsForConnection = new Map();
      registeredTaskGraphs.set(socket, graphsForConnection);
    }
    graphsForConnection.set(payload.taskGraphId, taskGraph);
    while (
      graphsForConnection.size > MAX_REGISTERED_TASK_GRAPHS_PER_CONNECTION
    ) {
      graphsForConnection.delete(graphsForConnection.keys().next().value);
    }
  } else {
    taskGraph = registeredTaskGraphs.get(socket)?.get(payload.taskGraphId);
    if (!taskGraph) {
      // Should not happen (the client re-registers on reconnect), but if it
      // does, ask the client to re-send the graph rather than throwing,
      // which would exit the daemon.
      return {
        response: TASK_GRAPH_NOT_REGISTERED,
        description: 'handleHashTasks',
      };
    }
  }

  const { error, projectGraph, rustReferences } =
    await getCachedSerializedProjectGraphPromise();

  if (error) {
    throw error;
  }

  const nxJson = readNxJson();

  if (projectGraph !== storedProjectGraph) {
    storedProjectGraph = projectGraph;
    storedHasher = new InProcessTaskHasher(
      projectGraph,
      nxJson,
      rustReferences,
      payload.runnerOptions
    );
  }
  const response = await storedHasher.hashTasks(
    payload.taskIds.map((id) => taskGraph.tasks[id]),
    taskGraph,
    payload.perTaskEnvs,
    payload.cwd,
    payload.collectInputs
  );
  return {
    response,
    description: 'handleHashTasks',
  };
}
