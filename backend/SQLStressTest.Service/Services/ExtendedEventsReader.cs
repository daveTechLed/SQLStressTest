using System.Collections.Concurrent;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Reads SQL Server Extended Events during stress test execution.
/// Based on the SqlQueryStress implementation with improved scalability through
/// separation of JSON serialization from event reading.
/// </summary>
public class ExtendedEventsReader : IDisposable
{
    private readonly string _connectionString;
    private readonly ConcurrentDictionary<Guid, List<IXEvent>> _events;
    private readonly string _sessionName;
    private readonly CancellationToken _cancellationToken;
    private readonly ILogger<ExtendedEventsReader>? _logger;
    private bool _isDisposed;
    private XELiveEventStreamer? _reader;
    private Task? _readTask;

    public ExtendedEventsReader(
        string connectionString, 
        CancellationToken cancellationToken,
        ConcurrentDictionary<Guid, List<IXEvent>> events,
        ILogger<ExtendedEventsReader>? logger = null)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
        _sessionName = $"SQLStressTest_{DateTime.Now:yyyyMMddHHmmss}";
        _cancellationToken = cancellationToken;
        _events = events ?? throw new ArgumentNullException(nameof(events));
        _logger = logger;
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    private static Guid ConvertByteArrayToGuid(byte[] hex)
    {
        if (hex == null || hex.Length == 0) return Guid.Empty;
        return new Guid(hex);
    }

    private void AddEventToDictionary(IXEvent exEvent)
    {
        if (!exEvent.Actions.TryGetValue("context_info", out var context)) 
        {
            _logger?.LogDebug("Event received without context_info, skipping");
            return;
        }

        try
        {
            var contextGuid = ConvertByteArrayToGuid((byte[])context);
            var eventList = _events.AddOrUpdate(
                contextGuid, 
                _ => new List<IXEvent>(), 
                (_, existingList) => existingList);
            eventList.Add(exEvent);
            
            _logger?.LogTrace("Event added to dictionary. EventName: {EventName}, ExecutionId: {ExecutionId}, TotalEvents: {TotalEvents}",
                exEvent.Name, contextGuid, eventList.Count);
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Failed to add event to dictionary. EventName: {EventName}", exEvent.Name);
        }
    }

    public async Task StartSessionAsync()
    {
        _logger?.LogInformation("Starting Extended Events session: {SessionName}", _sessionName);

        using (var conn = new SqlConnection(_connectionString))
        {
            await conn.OpenAsync();

            // Create XE session with all events from reference implementation
            var createSessionSql = $@"
                IF EXISTS (SELECT * FROM sys.server_event_sessions WHERE name = '{_sessionName}')
                    DROP EVENT SESSION [{_sessionName}] ON SERVER;

                CREATE EVENT SESSION [{_sessionName}] ON SERVER
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
    WHERE (([package0].[equal_boolean]([sqlserver].[is_system],(0))))),
ADD EVENT sqlserver.sp_statement_starting(SET collect_statement=(1)
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
   WHERE (([package0].[equal_boolean]([sqlserver].[is_system],(0))))),
ADD EVENT sqlserver.sql_batch_completed(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
WHERE (([package0].[equal_boolean]([sqlserver].[is_system],(0))))),
ADD EVENT sqlserver.sql_statement_completed(
    ACTION(sqlserver.client_app_name,sqlserver.client_pid,sqlserver.context_info,sqlserver.database_name,sqlserver.nt_username,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
WHERE (([package0].[equal_boolean]([sqlserver].[is_system],(0))))),
ADD EVENT sqlserver.sql_statement_starting(
    ACTION(sqlserver.client_app_name,sqlserver.context_info,sqlserver.database_id,sqlserver.query_hash,sqlserver.query_plan_hash,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id)
WHERE (([package0].[equal_boolean]([sqlserver].[is_system],(0))))),
ADD EVENT sqlserver.xml_deadlock_report(
    ACTION(sqlserver.context_info,sqlserver.server_principal_name,sqlserver.session_id,sqlserver.sql_text,sqlserver.transaction_id))
ADD TARGET package0.ring_buffer
WITH (MAX_MEMORY=4096 KB,EVENT_RETENTION_MODE=ALLOW_SINGLE_EVENT_LOSS,MAX_DISPATCH_LATENCY=30 SECONDS,MAX_EVENT_SIZE=0 KB,MEMORY_PARTITION_MODE=NONE,TRACK_CAUSALITY=ON,STARTUP_STATE=OFF)

                ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = START;";

            using var cmd = new SqlCommand(createSessionSql, conn);
            await cmd.ExecuteNonQueryAsync();
            
            _logger?.LogInformation("Extended Events session created and started: {SessionName}", _sessionName);
        }

        // Initialize XEvent reader
        _reader = new XELiveEventStreamer(_connectionString, _sessionName);
    }

    public async Task StopSessionAsync()
    {
        _logger?.LogInformation("Stopping Extended Events session: {SessionName}", _sessionName);

        using (var conn = new SqlConnection(_connectionString))
        {
            await conn.OpenAsync();
            var dropSessionSql = $@"
                IF EXISTS (SELECT * FROM sys.server_event_sessions WHERE name = '{_sessionName}')
                BEGIN
                    ALTER EVENT SESSION [{_sessionName}] ON SERVER STATE = STOP;
                    DROP EVENT SESSION [{_sessionName}] ON SERVER;
                END";

            using (var cmd = new SqlCommand(dropSessionSql, conn))
            {
                await cmd.ExecuteNonQueryAsync();
            }
        }

        _logger?.LogInformation("Extended Events session stopped and dropped: {SessionName}", _sessionName);
    }

    public Task StartReadingAsync()
    {
        if (_reader == null)
        {
            throw new InvalidOperationException("Session must be started before reading events");
        }

        _readTask = Task.Run(async () => await ReadEventsLoopAsync(), _cancellationToken);
        return _readTask;
    }

    private async Task ReadEventsLoopAsync()
    {
        if (_reader == null)
        {
            _logger?.LogError("Cannot read events: reader is null");
            return;
        }

        try
        {
            _logger?.LogInformation("Starting Extended Events read loop");
            
            while (!_cancellationToken.IsCancellationRequested)
            {
                var readTask = _reader.ReadEventStream(
                    () =>
                    {
                        _logger?.LogDebug("Connected to Extended Events session");
                        return Task.CompletedTask;
                    },
                    xevent =>
                    {
                        AddEventToDictionary(xevent);
                        return Task.CompletedTask;
                    },
                    _cancellationToken);

                await readTask;
                _logger?.LogDebug("Exited ReadEventStream, continuing loop");
            }
        }
        catch (OperationCanceledException)
        {
            _logger?.LogInformation("Extended Events read loop cancelled");
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error in Extended Events read loop");
        }
    }

    public string SessionName => _sessionName;

    protected virtual void Dispose(bool disposing)
    {
        if (!_isDisposed)
        {
            if (disposing)
            {
                try
                {
                    _logger?.LogInformation("Disposing ExtendedEventsReader");
                    
                    // Wait for read task to complete if it's running
                    if (_readTask != null && !_readTask.IsCompleted)
                    {
                        _logger?.LogDebug("Waiting for read task to complete");
                        Task.Run(async () => await StopSessionAsync()).Wait(TimeSpan.FromSeconds(5));
                    }
                    else
                    {
                        Task.Run(async () => await StopSessionAsync()).Wait(TimeSpan.FromSeconds(5));
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Error during ExtendedEventsReader disposal");
                }
            }

            _isDisposed = true;
        }
    }
}

