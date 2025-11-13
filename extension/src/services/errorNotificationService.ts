import * as vscode from 'vscode';
import { IErrorNotificationService } from './interfaces/IErrorNotificationService';
import { ExtendedEventsErrorDetails, SpawnErrorDetails, PrematureExitErrorDetails } from './interfaces/IErrorDetectionService';
import { ILogger } from './logger';

/**
 * Service responsible for notifying users about errors.
 * Single Responsibility: User-facing error notifications.
 */
export class ErrorNotificationService implements IErrorNotificationService {
    constructor(private readonly logger: ILogger) {}

    notifyExtendedEventsFailure(errorDetails: ExtendedEventsErrorDetails, logger: any): void {
        const connectionInfo = errorDetails.connectionDetails
            ? `\n\nConnection: ${errorDetails.connectionDetails}`
            : errorDetails.connectionName
                ? `\n\nConnection: ${errorDetails.connectionName}`
                : '';

        const errorMessage = `Extended Events Service Failed to Start\n\n` +
                           `Error Type: ${errorDetails.errorType}\n` +
                           `Error Details: ${errorDetails.specificError}${connectionInfo}\n\n` +
                           `What This Means:\n` +
                           `Extended Events is a critical service required for monitoring SQL query performance. ` +
                           `The application cannot continue without it.\n\n` +
                           `What You Should Do:\n${errorDetails.userAction}\n\n` +
                           `For more details, check the output logs (they will open automatically).`;

        this.logger.error('Extended Events startup failure detected - this is a critical service', {
            errorType: errorDetails.errorType,
            specificError: errorDetails.specificError,
            connectionInfo: errorDetails.connectionDetails || errorDetails.connectionName,
            sqlErrorNumber: errorDetails.sqlErrorNumber
        });

        vscode.window.showErrorMessage(errorMessage, { modal: true }).then(() => {
            if (logger && typeof logger.showOutputChannel === 'function') {
                logger.showOutputChannel();
            }
        });
    }

    notifySpawnFailure(errorDetails: SpawnErrorDetails): void {
        const errorMessage = `Failed to start backend process: ${errorDetails.errorMessage}. ` +
                           `Please check that the backend executable exists and has proper permissions.`;

        this.logger.error('Failed to start backend process', {
            error: errorDetails.errorMessage,
            code: errorDetails.code,
            errno: errorDetails.errno,
            syscall: errorDetails.syscall,
            path: errorDetails.path
        });

        vscode.window.showErrorMessage(errorMessage);
    }

    notifyPrematureExit(errorDetails: PrematureExitErrorDetails): void {
        let errorMessage = errorDetails.errorMessage;

        if (errorDetails.isGatekeeperKill) {
            errorMessage = `Backend executable was killed by macOS Gatekeeper (unsigned executable). ` +
                          `Use development mode (dotnet run) instead.`;
        }

        this.logger.error('Backend process exited before startup completed', {
            code: errorDetails.code,
            signal: errorDetails.signal,
            isGatekeeperKill: errorDetails.isGatekeeperKill
        });

        vscode.window.showErrorMessage(errorMessage);
    }

    notifyRestartFailure(errorMessage: string, attemptNumber: number, maxAttempts: number): void {
        const fullErrorMessage = `Backend service failed to start after ${maxAttempts} attempts. ` +
                                `Error: ${errorMessage}. Please check the logs.`;

        this.logger.error('Failed to restart backend', {
            error: errorMessage,
            attemptNumber,
            maxAttempts
        });

        vscode.window.showErrorMessage(fullErrorMessage);
    }

    notifyStartupFailure(errorMessage: string, attemptNumber: number, maxAttempts: number): void {
        const fullErrorMessage = attemptNumber >= maxAttempts
            ? `Backend service failed to start after ${maxAttempts} attempts. ` +
              `Last error: ${errorMessage}. Please check the logs.`
            : `Backend service failed to start after ${maxAttempts} attempts. Please check the logs.`;

        this.logger.error(`Backend failed to start after ${maxAttempts} attempts`, {
            lastError: errorMessage,
            attemptNumber,
            maxAttempts
        });

        vscode.window.showErrorMessage(fullErrorMessage);
    }
}

