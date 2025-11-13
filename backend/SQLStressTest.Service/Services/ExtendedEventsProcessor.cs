using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for processing Extended Events and storing them.
/// Single Responsibility: Event processing and storage only.
/// </summary>
public class ExtendedEventsProcessor
{
    private readonly ConcurrentDictionary<string, List<IXEvent>> _events;
    private readonly ILogger<ExtendedEventsProcessor>? _logger;
    private readonly SignalRMessageSender? _messageSender;
    private readonly ExtendedEventConverter? _eventConverter;

    public ExtendedEventsProcessor(
        ConcurrentDictionary<string, List<IXEvent>> events,
        ILogger<ExtendedEventsProcessor>? logger = null,
        SignalRMessageSender? messageSender = null,
        ExtendedEventConverter? eventConverter = null)
    {
        _events = events ?? throw new ArgumentNullException(nameof(events));
        _logger = logger;
        _messageSender = messageSender;
        _eventConverter = eventConverter;
    }

    /// <summary>
    /// Processes an event and adds it to the dictionary based on context_info.
    /// Also sends the event via SignalR in real-time if message sender is available.
    /// </summary>
    public void ProcessEvent(IXEvent xevent)
    {
        if (!xevent.Actions.TryGetValue("context_info", out var context)) 
        {
            _logger?.LogDebug("Event received without context_info, skipping");
            return;
        }

        try
        {
            var contextBytes = (byte[])context;
            if (contextBytes == null || contextBytes.Length == 0)
            {
                _logger?.LogDebug("Event received with empty context_info, skipping");
                return;
            }

            // Parse context_info as UTF-8 string
            var contextInfoString = Encoding.UTF8.GetString(contextBytes).TrimEnd('\0');
            
            // Check if context_info starts with "SQLSTRESSTEST_"
            const string prefix = "SQLSTRESSTEST_";
            if (!contextInfoString.StartsWith(prefix, StringComparison.Ordinal))
            {
                _logger?.LogDebug("Event received with context_info not starting with '{Prefix}', skipping. ContextInfo: {ContextInfo}", 
                    prefix, contextInfoString.Length > 50 ? contextInfoString.Substring(0, 50) + "..." : contextInfoString);
                return;
            }

            // Extract execution number from "SQLSTRESSTEST_XXXX"
            var executionNumberStr = contextInfoString.Substring(prefix.Length);
            if (!int.TryParse(executionNumberStr, out var executionNumber))
            {
                _logger?.LogWarning("Failed to parse execution number from context_info: {ContextInfo}", contextInfoString);
                return;
            }

            // Use execution number as key (format: "SQLSTRESSTEST_XXXX")
            var eventList = _events.AddOrUpdate(
                contextInfoString, 
                _ => new List<IXEvent>(), 
                (_, existingList) => existingList);
            eventList.Add(xevent);
            
            _logger?.LogTrace("Event added to dictionary. EventName: {EventName}, ContextInfo: {ContextInfo}, ExecutionNumber: {ExecutionNumber}, TotalEvents: {TotalEvents}",
                xevent.Name, contextInfoString, executionNumber, eventList.Count);

            // Send event via SignalR in real-time if message sender is available
            if (_messageSender != null && _eventConverter != null)
            {
                try
                {
                    // Convert execution number string back to Guid for compatibility with ExtendedEventData
                    // Use a deterministic Guid based on the execution number
                    var executionId = CreateGuidFromExecutionNumber(executionNumber);
                    var eventData = _eventConverter.ConvertToExtendedEventData(xevent, executionId, executionNumber);
                    
                    // Send asynchronously without awaiting to avoid blocking the event processing
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await _messageSender.SendExtendedEventDataAsync(eventData, CancellationToken.None);
                            _logger?.LogTrace("Extended Event sent via SignalR. EventName: {EventName}, ExecutionNumber: {ExecutionNumber}",
                                xevent.Name, executionNumber);
                        }
                        catch (Exception ex)
                        {
                            _logger?.LogWarning(ex, "Failed to send Extended Event via SignalR. EventName: {EventName}, ExecutionNumber: {ExecutionNumber}",
                                xevent.Name, executionNumber);
                        }
                    });
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "Failed to convert or send Extended Event. EventName: {EventName}, ExecutionNumber: {ExecutionNumber}",
                        xevent.Name, executionNumber);
                }
            }
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Failed to process event. EventName: {EventName}", xevent.Name);
        }
    }

    /// <summary>
    /// Creates a deterministic Guid from an execution number for compatibility with ExtendedEventData.
    /// </summary>
    private static Guid CreateGuidFromExecutionNumber(int executionNumber)
    {
        var bytes = new byte[16];
        var numberBytes = BitConverter.GetBytes(executionNumber);
        Array.Copy(numberBytes, bytes, 4);
        // Fill rest with zeros for deterministic Guid
        return new Guid(bytes);
    }
}

