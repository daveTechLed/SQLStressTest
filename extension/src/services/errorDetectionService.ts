import { IErrorDetectionService, ExtendedEventsErrorDetails, SpawnErrorDetails, PrematureExitErrorDetails } from './interfaces/IErrorDetectionService';
import { ILogger } from './logger';

/**
 * Service responsible for detecting various types of errors from backend process output.
 * Single Responsibility: Error detection and classification.
 */
export class ErrorDetectionService implements IErrorDetectionService {
    constructor(private readonly logger: ILogger) {}

    detectExtendedEventsFailure(stdoutBuffer: string, stderrBuffer: string): ExtendedEventsErrorDetails | null {
        const combinedOutput = stdoutBuffer + stderrBuffer;
        const combinedOutputLower = combinedOutput.toLowerCase();
        const isExtendedEventsFailure = combinedOutputLower.includes('extended events service failed to start') ||
                                      combinedOutputLower.includes('extended events is a critical service');

        if (!isExtendedEventsFailure) {
            return null;
        }

        // Extract detailed error information from output
        const structuredErrorMatch = combinedOutput.match(/EXTENDED_EVENTS_ERROR:\s*([^\n]+)/i);
        const sqlErrorNumberMatch = combinedOutput.match(/SQL_ERROR_NUMBER:\s*(\d+)/i);
        const connectionNameMatch = combinedOutput.match(/CONNECTION_NAME:\s*([^\n]+)/i);
        const connectionServerMatch = combinedOutput.match(/CONNECTION_SERVER:\s*([^\n]+)/i);
        const connectionDatabaseMatch = combinedOutput.match(/CONNECTION_DATABASE:\s*([^\n]+)/i);

        // Fallback to parsing from log messages if structured markers not found
        const fullErrorMatch = combinedOutput.match(/Extended Events service failed to start:([^\n]+)/i);
        const sqlErrorMatch = combinedOutput.match(/SQL Error (\d+):\s*([^\n]+)/i);
        const connectionMatch = combinedOutput.match(/Connection:\s*([^(]+)\s*\(([^)]+)\)/i);
        const timeoutMatch = combinedOutput.match(/No SQL connection available after ([\d.]+) seconds/i);

        // Extract the specific error message
        let specificError = 'Unknown error';
        let errorType = 'general';
        let userAction = '';
        let sqlErrorNumber = '';
        let connectionName = '';
        let connectionDetails = '';

        // Use structured error if available, otherwise parse from log format
        if (structuredErrorMatch) {
            specificError = structuredErrorMatch[1].trim();
            if (sqlErrorNumberMatch) {
                sqlErrorNumber = sqlErrorNumberMatch[1];
            } else {
                const sqlErrorInMessage = specificError.match(/SQL Error (\d+):/i);
                if (sqlErrorInMessage) {
                    sqlErrorNumber = sqlErrorInMessage[1];
                }
            }
            if (connectionNameMatch) {
                connectionName = connectionNameMatch[1].trim();
            }
            if (connectionServerMatch && connectionDatabaseMatch) {
                connectionDetails = `${connectionServerMatch[1].trim()}/${connectionDatabaseMatch[1].trim()}`;
            }
        } else if (sqlErrorMatch) {
            sqlErrorNumber = sqlErrorMatch[1];
            const sqlErrorMessage = sqlErrorMatch[2].trim();
            specificError = `SQL Error ${sqlErrorNumber}: ${sqlErrorMessage}`;
        } else if (fullErrorMatch) {
            specificError = fullErrorMatch[1].trim();
            const sqlErrorInMessage = specificError.match(/SQL Error (\d+):/i);
            if (sqlErrorInMessage) {
                sqlErrorNumber = sqlErrorInMessage[1];
            }
        }

        // Provide specific guidance based on SQL error number
        if (sqlErrorNumber) {
            switch (sqlErrorNumber) {
                case '156':
                    errorType = 'SQL Syntax Error';
                    userAction = `This indicates a SQL syntax error in the Extended Events session definition.\n\n` +
                               `Action: This is likely a bug in the application. Please:\n` +
                               `1. Check the latest logs for the full error details\n` +
                               `2. Report this issue with the error message and log file\n` +
                               `3. Try restarting the application`;
                    break;
                case '25704':
                    errorType = 'Extended Events Session Error';
                    userAction = `The Extended Events session may already be running or in an invalid state.\n\n` +
                               `Action: Try the following:\n` +
                               `1. Restart SQL Server (if you have access)\n` +
                               `2. Manually drop the Extended Events session if it exists:\n` +
                               `   DROP EVENT SESSION [SQLStressTest_Persistent] ON SERVER;\n` +
                               `3. Restart the application`;
                    break;
                case '18456':
                    errorType = 'Authentication Failed';
                    userAction = `The SQL connection credentials are invalid or the login failed.\n\n` +
                               `Action: Please:\n` +
                               `1. Verify your SQL connection credentials in the connection settings\n` +
                               `2. Test the connection using the "Test Connection" feature\n` +
                               `3. Ensure the SQL Server allows the authentication method you're using`;
                    break;
                case '4060':
                    errorType = 'Database Not Available';
                    userAction = `Cannot open the specified database.\n\n` +
                               `Action: Please:\n` +
                               `1. Verify the database name in your connection settings\n` +
                               `2. Ensure the database exists and is accessible\n` +
                               `3. Check that your SQL user has access to the database`;
                    break;
                case '2':
                case '53':
                    errorType = 'Connection Failed';
                    userAction = `Cannot connect to the SQL Server.\n\n` +
                               `Action: Please:\n` +
                               `1. Verify the server name and port in your connection settings\n` +
                               `2. Ensure SQL Server is running and accessible\n` +
                               `3. Check firewall settings if connecting to a remote server\n` +
                               `4. Test the connection using the "Test Connection" feature`;
                    break;
                default:
                    errorType = 'SQL Error';
                    userAction = `A SQL Server error occurred (Error ${sqlErrorNumber}).\n\n` +
                               `Action: Please:\n` +
                               `1. Check the full error message in the logs\n` +
                               `2. Verify your SQL connection settings are correct\n` +
                               `3. Ensure you have proper permissions to create Extended Events sessions\n` +
                               `4. Test the connection using the "Test Connection" feature`;
            }
        }

        // Handle timeout case
        if (!sqlErrorNumber && timeoutMatch) {
            const elapsedSeconds = timeoutMatch[1];
            specificError = `No SQL connection available after ${elapsedSeconds} seconds`;
            errorType = 'Connection Timeout';
            userAction = `The application waited for a SQL connection but none was found.\n\n` +
                       `Action: Please:\n` +
                       `1. Ensure at least one SQL connection is configured and saved\n` +
                       `2. Open the SQL Server Explorer and verify your connections are listed\n` +
                       `3. If no connections exist, add a new connection using the "+" button\n` +
                       `4. Save the connection and restart the application`;
        } else if (!sqlErrorNumber && !errorType) {
            errorType = 'Startup Error';
            userAction = `Extended Events service could not start.\n\n` +
                       `Action: Please:\n` +
                       `1. Check the logs for detailed error information\n` +
                       `2. Verify your SQL connection is valid and accessible\n` +
                       `3. Ensure you have proper permissions to create Extended Events sessions\n` +
                       `4. Test the connection using the "Test Connection" feature`;
        }

        // Build connection info if available
        if (connectionName || connectionDetails) {
            if (connectionName && connectionDetails) {
                connectionDetails = `${connectionName} (${connectionDetails})`;
            } else if (connectionName) {
                connectionDetails = connectionName;
            }
        } else if (connectionMatch) {
            connectionName = connectionMatch[1].trim();
            connectionDetails = `${connectionName} (${connectionMatch[2].trim()})`;
        }

        this.logger.log('Extended Events failure detected', {
            errorType,
            specificError,
            sqlErrorNumber,
            connectionName,
            connectionDetails
        });

        return {
            errorType,
            specificError,
            sqlErrorNumber: sqlErrorNumber || undefined,
            connectionName: connectionName || undefined,
            connectionDetails: connectionDetails || undefined,
            userAction
        };
    }

    detectGatekeeperKill(
        code: number | null,
        signal: string | null,
        stdoutBuffer: string,
        stderrBuffer: string,
        isDevelopmentMode: boolean
    ): boolean {
        const isGatekeeperKill = (signal === 'SIGKILL' && (code === null || code === 137)) &&
                                 !isDevelopmentMode &&
                                 stdoutBuffer.length === 0 &&
                                 stderrBuffer.length === 0;

        if (isGatekeeperKill) {
            this.logger.warn('macOS Gatekeeper kill detected');
        }

        return isGatekeeperKill;
    }

    detectSpawnFailure(error: Error): SpawnErrorDetails | null {
        const spawnError = error as any;
        return {
            errorMessage: error.message,
            code: spawnError.code,
            errno: spawnError.errno,
            syscall: spawnError.syscall,
            path: spawnError.path
        };
    }

    detectPrematureExit(
        code: number | null,
        signal: string | null,
        startupCompleted: boolean,
        isShuttingDown: boolean
    ): PrematureExitErrorDetails | null {
        if (startupCompleted || isShuttingDown) {
            return null;
        }

        return {
            errorMessage: `Backend process exited with code ${code} before startup completed`,
            code,
            signal,
            isGatekeeperKill: false // Will be set separately if needed
        };
    }
}

