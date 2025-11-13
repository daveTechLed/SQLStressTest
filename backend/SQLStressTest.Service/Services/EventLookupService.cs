using System.Collections.Concurrent;
using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for looking up Extended Events by context_info key.
/// Single Responsibility: Event lookup only.
/// </summary>
public class EventLookupService
{
    /// <summary>
    /// Looks up events for a specific execution number using the context_info key format.
    /// </summary>
    /// <param name="events">The dictionary containing all events keyed by context_info</param>
    /// <param name="executionNumber">The execution number to look up</param>
    /// <returns>The list of events for this execution, or null if not found</returns>
    public List<IXEvent>? LookupEventsByExecutionNumber(
        ConcurrentDictionary<string, List<IXEvent>> events,
        int executionNumber)
    {
        // Look up events using context_info key format: "SQLSTRESSTEST_XXXX"
        var contextInfoKey = $"SQLSTRESSTEST_{executionNumber}";
        
        if (events.TryGetValue(contextInfoKey, out var executionEvents) && executionEvents != null)
        {
            return executionEvents;
        }
        
        return null;
    }
}

