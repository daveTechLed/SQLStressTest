using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for managing Extended Events session lifecycle.
/// Single Responsibility: Session management (create, start, stop, drop) only.
/// </summary>
public class ExtendedEventsSessionManager
{
    private readonly string _connectionString;
    private readonly string _sessionName;
    private readonly bool _isPersistentSession;
    private readonly ILogger<ExtendedEventsSessionManager>? _logger;

    public ExtendedEventsSessionManager(
        string connectionString,
        string sessionName,
        bool isPersistentSession,
        ILogger<ExtendedEventsSessionManager>? logger = null)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
        _sessionName = sessionName ?? throw new ArgumentNullException(nameof(sessionName));
        _isPersistentSession = isPersistentSession;
        _logger = logger;
    }

    /// <summary>
    /// Creates and starts an Extended Events session.
    /// </summary>
    public async Task StartSessionAsync()
    {
        _logger?.LogInformation("Starting Extended Events session: {SessionName}", _sessionName);

        using (var conn = new SqlConnection(_connectionString))
        {
            await conn.OpenAsync();

            // Create XE session with all events from reference implementation
            // Note: We don't filter by context_info in the Extended Events session definition
            // because Extended Events predicates don't support IS NOT NULL or string prefix matching.
            // Instead, we capture all events and filter by context_info prefix in ExtendedEventsProcessor.
            var eventsDefinition = $@"
ADD EVENT sqlos.wait_info(
    ACTION(sqlserver.context_info,sqlserver.session_id,sqlserver.transaction_id)
    WHERE ([package0].[equal_boolean]([sqlserver].[is_system],(0)) AND [wait_type]<>'SOS_WORK_DISPATCHER')),
ADD EVENT sqlserver.blocked_process_report(
    ACTION(sqlserver.context_info,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)),
ADD EVENT sqlserver.lock_cancel(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)),
ADD EVENT sqlserver.lock_deadlock(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)),
ADD EVENT sqlserver.lock_deadlock_chain(
    ACTION(sqlserver.context_info,sqlserver.database_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)),
ADD EVENT sqlserver.lock_escalation(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)),
ADD EVENT sqlserver.lock_timeout_greater_than_0(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)),
ADD EVENT sqlserver.sp_statement_completed(SET collect_statement=(1)
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
    WHERE ([package0].[equal_boolean]([sqlserver].[is_system],(0)))),
ADD EVENT sqlserver.sp_statement_starting(SET collect_statement=(1)
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
   WHERE ([package0].[equal_boolean]([sqlserver].[is_system],(0)))),
ADD EVENT sqlserver.sql_batch_completed(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
WHERE ([package0].[equal_boolean]([sqlserver].[is_system],(0)))),
ADD EVENT sqlserver.sql_statement_completed(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
WHERE ([package0].[equal_boolean]([sqlserver].[is_system],(0)))),
ADD EVENT sqlserver.sql_statement_starting(
    ACTION(sqlserver.client_app_name,sqlserver.context_info,sqlserver.database_id,sqlserver.query_hash,sqlserver.query_plan_hash,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
WHERE ([package0].[equal_boolean]([sqlserver].[is_system],(0)))),
ADD EVENT sqlserver.xml_deadlock_report(
    ACTION(sqlserver.context_info,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id))
ADD TARGET package0.ring_buffer
WITH (MAX_MEMORY=4096 KB,EVENT_RETENTION_MODE=ALLOW_SINGLE_EVENT_LOSS,MAX_DISPATCH_LATENCY=30 SECONDS,MAX_EVENT_SIZE=0 KB,MEMORY_PARTITION_MODE=NONE,TRACK_CAUSALITY=ON,STARTUP_STATE=OFF)";

            var createSessionSql = _isPersistentSession ? $@"
                IF NOT EXISTS (SELECT * FROM sys.server_event_sessions WHERE name = '{_sessionName}')
                BEGIN
                    CREATE EVENT SESSION [{_sessionName}] ON SERVER
{eventsDefinition}

                    ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = START;
                END
                ELSE
                BEGIN
                    -- Session already exists, just ensure it's started
                    -- sys.dm_xe_sessions only contains running sessions, so if it's not there, it's stopped
                    IF NOT EXISTS (SELECT * FROM sys.dm_xe_sessions WHERE name = '{_sessionName}')
                    BEGIN
                        ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = START;
                    END
                END;" : $@"
                IF EXISTS (SELECT * FROM sys.server_event_sessions WHERE name = '{_sessionName}')
                    DROP EVENT SESSION [{_sessionName}] ON SERVER;

                CREATE EVENT SESSION [{_sessionName}] ON SERVER
{eventsDefinition}

                ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = START;";

            using var cmd = new SqlCommand(createSessionSql, conn);
            await cmd.ExecuteNonQueryAsync();
            
            if (_isPersistentSession)
            {
                _logger?.LogInformation("Extended Events persistent session ensured: {SessionName}", _sessionName);
            }
            else
            {
                _logger?.LogInformation("Extended Events session created and started: {SessionName}", _sessionName);
            }
        }
    }

    /// <summary>
    /// Stops and optionally drops an Extended Events session.
    /// </summary>
    public async Task StopSessionAsync()
    {
        _logger?.LogInformation("Stopping Extended Events session: {SessionName}", _sessionName);

        using (var conn = new SqlConnection(_connectionString))
        {
            await conn.OpenAsync();
            
            // For persistent sessions, only stop (don't drop). For temporary sessions, stop and drop.
            var stopSessionSql = _isPersistentSession ? $@"
                IF EXISTS (SELECT * FROM sys.server_event_sessions WHERE name = '{_sessionName}')
                BEGIN
                    ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = STOP;
                END" : $@"
                IF EXISTS (SELECT * FROM sys.server_event_sessions WHERE name = '{_sessionName}')
                BEGIN
                    ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = STOP;
                    DROP EVENT SESSION [{_sessionName}] ON SERVER;
                END";

            using (var cmd = new SqlCommand(stopSessionSql, conn))
            {
                await cmd.ExecuteNonQueryAsync();
            }
        }

        if (_isPersistentSession)
        {
            _logger?.LogInformation("Extended Events persistent session stopped: {SessionName}", _sessionName);
        }
        else
        {
            _logger?.LogInformation("Extended Events session stopped and dropped: {SessionName}", _sessionName);
        }
    }

    public string SessionName => _sessionName;
}

