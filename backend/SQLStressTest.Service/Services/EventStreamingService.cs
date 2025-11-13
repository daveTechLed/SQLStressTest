using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for streaming Extended Events data.
/// Single Responsibility: Event streaming only.
/// </summary>
public class EventStreamingService
{
    private readonly ExtendedEventConverter _eventConverter;
    private readonly SignalRMessageSender _messageSender;
    private readonly ILogger<EventStreamingService> _logger;

    public EventStreamingService(
        ExtendedEventConverter eventConverter,
        SignalRMessageSender messageSender,
        ILogger<EventStreamingService> logger)
    {
        _eventConverter = eventConverter ?? throw new ArgumentNullException(nameof(eventConverter));
        _messageSender = messageSender ?? throw new ArgumentNullException(nameof(messageSender));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Streams a list of Extended Events to clients via SignalR.
    /// </summary>
    /// <param name="events">The events to stream</param>
    /// <param name="executionId">The execution ID for correlation</param>
    /// <param name="executionNumber">The execution number for correlation</param>
    /// <param name="cancellationToken">Cancellation token</param>
    public async Task StreamEventsAsync(
        List<IXEvent> events,
        Guid executionId,
        int executionNumber,
        CancellationToken cancellationToken)
    {
        foreach (var xevent in events)
        {
            try
            {
                var eventData = _eventConverter.ConvertToExtendedEventData(xevent, executionId, executionNumber);
                await _messageSender.SendExtendedEventDataAsync(eventData, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error converting or streaming event. EventName: {EventName}", xevent.Name);
            }
        }
    }
}

