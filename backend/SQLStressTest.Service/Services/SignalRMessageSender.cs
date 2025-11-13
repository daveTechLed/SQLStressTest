using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for sending messages via SignalR.
/// Single Responsibility: SignalR messaging only.
/// </summary>
public class SignalRMessageSender
{
    private readonly IHubContext<SqlHub> _hubContext;
    private readonly ILogger<SignalRMessageSender> _logger;

    public SignalRMessageSender(
        IHubContext<SqlHub> hubContext,
        ILogger<SignalRMessageSender> logger)
    {
        _hubContext = hubContext ?? throw new ArgumentNullException(nameof(hubContext));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Sends an execution boundary event.
    /// </summary>
    public async Task SendExecutionBoundaryAsync(
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

    /// <summary>
    /// Sends execution metrics.
    /// </summary>
    public async Task SendExecutionMetricsAsync(
        int executionNumber,
        Guid executionId,
        long dataSizeBytes,
        CancellationToken cancellationToken)
    {
        var timestamp = DateTime.UtcNow;
        var metrics = new ExecutionMetrics
        {
            ExecutionNumber = executionNumber,
            ExecutionId = executionId,
            DataSizeBytes = dataSizeBytes,
            Timestamp = timestamp,
            TimestampMs = ((DateTimeOffset)timestamp).ToUnixTimeMilliseconds()
        };

        try
        {
            await _hubContext.Clients.All.SendAsync("ExecutionMetrics", metrics, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending execution metrics. ExecutionNumber: {ExecutionNumber}",
                executionNumber);
        }
    }

    /// <summary>
    /// Sends Extended Event data.
    /// </summary>
    public async Task SendExtendedEventDataAsync(
        ExtendedEventData eventData,
        CancellationToken cancellationToken)
    {
        try
        {
            await _hubContext.Clients.All.SendAsync("ExtendedEventData", eventData, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending Extended Event data. EventName: {EventName}, ExecutionNumber: {ExecutionNumber}",
                eventData.EventName, eventData.ExecutionNumber);
        }
    }
}

