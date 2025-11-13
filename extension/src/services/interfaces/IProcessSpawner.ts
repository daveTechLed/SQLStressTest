import { ChildProcess } from 'child_process';

/**
 * Interface for spawning backend processes.
 * Single Responsibility: Process spawning logic.
 */
export interface IProcessSpawner {
    /**
     * Spawn a backend process.
     * @param command - Command to execute
     * @param args - Command arguments
     * @param options - Spawn options (cwd, env, stdio)
     * @returns Spawned child process
     */
    spawn(
        command: string,
        args: string[],
        options: {
            cwd: string;
            env: NodeJS.ProcessEnv;
            stdio: ('ignore' | 'pipe')[];
        }
    ): ChildProcess;
}

