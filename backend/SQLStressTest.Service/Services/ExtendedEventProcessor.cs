using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for processing and streaming Extended Events.
/// Single Responsibility: Event processing orchestration only.
/// </summary>
public class ExtendedEventProcessor
{
    private readonly EventLookupService _eventLookupService;
    private readonly EventStreamingService _eventStreamingService;
    private readonly ILogger<ExtendedEventProcessor> _logger;

    public ExtendedEventProcessor(
        EventLookupService eventLookupService,
        EventStreamingService eventStreamingService,
        ILogger<ExtendedEventProcessor> logger)
    {
        _eventLookupService = eventLookupService ?? throw new ArgumentNullException(nameof(eventLookupService));
        _eventStreamingService = eventStreamingService ?? throw new ArgumentNullException(nameof(eventStreamingService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Processes and streams events for a specific execution.
    /// </summary>
    public async Task ProcessAndStreamEventsAsync(
        Guid executionId,
        int executionNumber,
        ConcurrentDictionary<string, List<IXEvent>> events,
        CancellationToken cancellationToken)
    {
        // Look up events using the lookup service
        var executionEvents = _eventLookupService.LookupEventsByExecutionNumber(events, executionNumber);
        
        if (executionEvents == null || executionEvents.Count == 0)
        {
            return;
        }

        // Stream events using the streaming service
        await _eventStreamingService.StreamEventsAsync(executionEvents, executionId, executionNumber, cancellationToken);
    }
}

