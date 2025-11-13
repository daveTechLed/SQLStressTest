import { spawn, ChildProcess } from 'child_process';
import { IProcessSpawner } from './interfaces/IProcessSpawner';

/**
 * Service responsible for spawning backend processes.
 * Single Responsibility: Process spawning logic.
 */
export class ProcessSpawner implements IProcessSpawner {
    spawn(
        command: string,
        args: string[],
        options: {
            cwd: string;
            env: NodeJS.ProcessEnv;
            stdio: ('ignore' | 'pipe')[];
        }
    ): ChildProcess {
        return spawn(command, args, options);
    }
}

