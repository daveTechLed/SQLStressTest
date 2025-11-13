import { ExtendedEventsErrorDetails, SpawnErrorDetails, PrematureExitErrorDetails } from '../interfaces/IErrorDetectionService';

/**
 * Interface for notifying users about errors.
 * Single Responsibility: User-facing error notifications.
 */
export interface IErrorNotificationService {
    /**
     * Show error dialog for Extended Events failure.
     * @param errorDetails - Extended Events error details
     * @param logger - Logger instance for showing output channel
     */
    notifyExtendedEventsFailure(errorDetails: ExtendedEventsErrorDetails, logger: any): void;

    /**
     * Show error dialog for spawn failure.
     * @param errorDetails - Spawn error details
     */
    notifySpawnFailure(errorDetails: SpawnErrorDetails): void;

    /**
     * Show error dialog for premature exit.
     * @param errorDetails - Premature exit error details
     */
    notifyPrematureExit(errorDetails: PrematureExitErrorDetails): void;

    /**
     * Show error dialog for restart failure.
     * @param errorMessage - Error message
     * @param attemptNumber - Current restart attempt number
     * @param maxAttempts - Maximum restart attempts
     */
    notifyRestartFailure(errorMessage: string, attemptNumber: number, maxAttempts: number): void;

    /**
     * Show error dialog for general backend startup failure.
     * @param errorMessage - Error message
     * @param attemptNumber - Current restart attempt number
     * @param maxAttempts - Maximum restart attempts
     */
    notifyStartupFailure(errorMessage: string, attemptNumber: number, maxAttempts: number): void;
}

