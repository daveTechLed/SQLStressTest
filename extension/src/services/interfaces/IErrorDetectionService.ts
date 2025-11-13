/**
 * Interface for detecting various types of errors from backend process output.
 * Single Responsibility: Error detection and classification.
 */
export interface IErrorDetectionService {
    /**
     * Detect if Extended Events service failed to start.
     * @param stdoutBuffer - Standard output buffer from backend process
     * @param stderrBuffer - Standard error buffer from backend process
     * @returns Error details if Extended Events failure detected, null otherwise
     */
    detectExtendedEventsFailure(stdoutBuffer: string, stderrBuffer: string): ExtendedEventsErrorDetails | null;

    /**
     * Detect if process was killed by macOS Gatekeeper.
     * @param code - Process exit code
     * @param signal - Process exit signal
     * @param stdoutBuffer - Standard output buffer
     * @param stderrBuffer - Standard error buffer
     * @param isDevelopmentMode - Whether running in development mode
     * @returns True if Gatekeeper kill detected
     */
    detectGatekeeperKill(
        code: number | null,
        signal: string | null,
        stdoutBuffer: string,
        stderrBuffer: string,
        isDevelopmentMode: boolean
    ): boolean;

    /**
     * Detect if process failed to start (spawn error).
     * @param error - Process spawn error
     * @returns Error details if spawn failure detected, null otherwise
     */
    detectSpawnFailure(error: Error): SpawnErrorDetails | null;

    /**
     * Detect if process exited before startup completed.
     * @param code - Process exit code
     * @param signal - Process exit signal
     * @param startupCompleted - Whether startup was completed
     * @param isShuttingDown - Whether intentionally shutting down
     * @returns Error details if premature exit detected, null otherwise
     */
    detectPrematureExit(
        code: number | null,
        signal: string | null,
        startupCompleted: boolean,
        isShuttingDown: boolean
    ): PrematureExitErrorDetails | null;
}

export interface ExtendedEventsErrorDetails {
    errorType: string;
    specificError: string;
    sqlErrorNumber?: string;
    connectionName?: string;
    connectionDetails?: string;
    userAction: string;
}

export interface SpawnErrorDetails {
    errorMessage: string;
    code?: string;
    errno?: number;
    syscall?: string;
    path?: string;
}

export interface PrematureExitErrorDetails {
    errorMessage: string;
    code: number | null;
    signal: string | null;
    isGatekeeperKill: boolean;
}

