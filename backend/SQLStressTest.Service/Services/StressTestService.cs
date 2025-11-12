using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

public class StressTestService : IStressTestService
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly IHubContext<SqlHub> _hubContext;
    private readonly ILogger<StressTestService> _logger;
    private readonly ILoggerFactory _loggerFactory;

    public StressTestService(
        IConnectionStringBuilder connectionStringBuilder,
        ISqlConnectionFactory connectionFactory,
        IHubContext<SqlHub> hubContext,
        ILogger<StressTestService> logger,
        ILoggerFactory loggerFactory)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
    }

    public async Task<StressTestResponse> ExecuteStressTestAsync(
        ConnectionConfig config,
        string query,
        int parallelExecutions,
        int totalExecutions,
        CancellationToken cancellationToken = default)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        if (string.IsNullOrWhiteSpace(query))
        {
            throw new ArgumentException("Query cannot be null or empty", nameof(query));
        }

        var testId = Guid.NewGuid().ToString();
        _logger.LogInformation("Starting stress test. TestId: {TestId}, ParallelExecutions: {ParallelExecutions}, TotalExecutions: {TotalExecutions}",
            testId, parallelExecutions, totalExecutions);

        var connectionString = _connectionStringBuilder.Build(config);
        var events = new ConcurrentDictionary<Guid, List<IXEvent>>();
        ExtendedEventsReader? eventsReader = null;

        try
        {
            // Start Extended Events session
            // Create logger using the factory - CreateLogger<T> is an extension method
            var eventsReaderLogger = Microsoft.Extensions.Logging.LoggerFactoryExtensions.CreateLogger<ExtendedEventsReader>(_loggerFactory);
            eventsReader = new ExtendedEventsReader(connectionString, cancellationToken, events, eventsReaderLogger);
            await eventsReader.StartSessionAsync();
            
            // Start reading events in background
            var readTask = eventsReader.StartReadingAsync();

            // Execute queries in parallel
            var executionGuids = new ConcurrentDictionary<int, Guid>();
            var executionStartTimes = new ConcurrentDictionary<int, DateTime>();

            var parallelOptions = new ParallelOptions
            {
                MaxDegreeOfParallelism = parallelExecutions,
                CancellationToken = cancellationToken
            };

            await Parallel.ForEachAsync(
                Enumerable.Range(1, totalExecutions),
                parallelOptions,
                async (executionNumber, ct) =>
                {
                    var executionId = Guid.NewGuid();
                    executionGuids[executionNumber] = executionId;
                    var startTime = DateTime.UtcNow;
                    executionStartTimes[executionNumber] = startTime;

                    // Send execution boundary (start)
                    await SendExecutionBoundaryAsync(executionNumber, executionId, startTime, true, ct);

                    try
                    {
                        // Set context_info before executing query
                        await ExecuteQueryWithContextInfoAsync(connectionString, query, executionId, ct);

                        var endTime = DateTime.UtcNow;
                        
                        // Send execution boundary (end)
                        await SendExecutionBoundaryAsync(executionNumber, executionId, endTime, false, ct);

                        // Process and stream events for this execution
                        await ProcessAndStreamEventsAsync(executionId, executionNumber, events, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error executing query for execution {ExecutionNumber}", executionNumber);
                        var endTime = DateTime.UtcNow;
                        await SendExecutionBoundaryAsync(executionNumber, executionId, endTime, false, ct);
                    }
                });

            // Wait a bit for any remaining events to be captured
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);

            // Process any remaining events
            foreach (var kvp in executionGuids)
            {
                await ProcessAndStreamEventsAsync(kvp.Value, kvp.Key, events, cancellationToken);
            }

            _logger.LogInformation("Stress test completed. TestId: {TestId}", testId);

            return new StressTestResponse
            {
                Success = true,
                TestId = testId,
                Message = $"Stress test completed: {totalExecutions} executions with {parallelExecutions} parallel"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during stress test execution. TestId: {TestId}", testId);
            return new StressTestResponse
            {
                Success = false,
                TestId = testId,
                Error = ex.Message
            };
        }
        finally
        {
            // Stop Extended Events session
            if (eventsReader != null)
            {
                try
                {
                    await eventsReader.StopSessionAsync();
                    eventsReader.Dispose();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error stopping Extended Events session");
                }
            }
        }
    }

    private async Task ExecuteQueryWithContextInfoAsync(
        string connectionString,
        string query,
        Guid executionId,
        CancellationToken cancellationToken)
    {
        using var connection = _connectionFactory.CreateConnection(connectionString);
        await connection.OpenAsync();

        // Set context_info to the execution GUID for correlation
        var contextInfoBytes = executionId.ToByteArray();
        var contextInfoHex = "0x" + string.Join("", contextInfoBytes.Select(b => b.ToString("X2")));
        var setContextInfoQuery = $"SET CONTEXT_INFO {contextInfoHex}";

        using (var contextCommand = connection.CreateCommand(setContextInfoQuery))
        {
            await contextCommand.ExecuteScalarAsync();
        }

        // Execute the actual query
        using var command = connection.CreateCommand(query);
        using var reader = await command.ExecuteReaderAsync();

        // Read all rows to ensure query completes
        while (await reader.ReadAsync())
        {
            // Just read through the results
            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task ProcessAndStreamEventsAsync(
        Guid executionId,
        int executionNumber,
        ConcurrentDictionary<Guid, List<IXEvent>> events,
        CancellationToken cancellationToken)
    {
        if (!events.TryGetValue(executionId, out var executionEvents) || executionEvents == null)
        {
            return;
        }

        foreach (var xevent in executionEvents)
        {
            try
            {
                var eventData = ConvertToExtendedEventData(xevent, executionId, executionNumber);
                await _hubContext.Clients.All.SendAsync("ExtendedEventData", eventData, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error converting or streaming event. EventName: {EventName}", xevent.Name);
            }
        }
    }

    private ExtendedEventData ConvertToExtendedEventData(IXEvent xevent, Guid executionId, int executionNumber)
    {
        var eventData = new ExtendedEventData
        {
            EventName = xevent.Name,
            Timestamp = xevent.Timestamp.DateTime,
            ExecutionId = executionId,
            ExecutionNumber = executionNumber
        };

        // Convert event fields
        foreach (var field in xevent.Fields)
        {
            eventData.EventFields[field.Key] = ConvertValue(field.Value);
        }

        // Convert actions
        foreach (var action in xevent.Actions)
        {
            eventData.Actions[action.Key] = ConvertValue(action.Value);
        }

        return eventData;
    }

    private object? ConvertValue(object? value)
    {
        if (value == null)
        {
            return null;
        }

        // Handle byte arrays (like context_info) - convert to base64 string for JSON serialization
        if (value is byte[] bytes)
        {
            return Convert.ToBase64String(bytes);
        }

        // Handle other types - let JSON serializer handle them
        return value;
    }

    private async Task SendExecutionBoundaryAsync(
        int executionNumber,
        Guid executionId,
        DateTime timestamp,
        bool isStart,
        CancellationToken cancellationToken)
    {
        var boundary = new ExecutionBoundary
        {
            ExecutionNumber = executionNumber,
            ExecutionId = executionId,
            StartTime = isStart ? timestamp : DateTime.MinValue,
            EndTime = isStart ? null : timestamp,
            IsStart = isStart,
            TimestampMs = ((DateTimeOffset)timestamp).ToUnixTimeMilliseconds()
        };

        try
        {
            await _hubContext.Clients.All.SendAsync("ExecutionBoundary", boundary, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending execution boundary. ExecutionNumber: {ExecutionNumber}, IsStart: {IsStart}",
                executionNumber, isStart);
        }
    }
}

