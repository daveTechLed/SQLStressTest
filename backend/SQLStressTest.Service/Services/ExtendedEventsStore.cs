using System.Collections.Concurrent;
using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Singleton service that holds the shared Extended Events dictionary.
/// Single Responsibility: Providing shared access to Extended Events storage.
/// </summary>
public class ExtendedEventsStore
{
    /// <summary>
    /// Shared dictionary of Extended Events, keyed by context_info string (format: "SQLSTRESSTEST_XXXX").
    /// Thread-safe ConcurrentDictionary for concurrent access from multiple stress tests and the hosted service.
    /// </summary>
    public ConcurrentDictionary<string, List<IXEvent>> Events { get; }

    public ExtendedEventsStore()
    {
        Events = new ConcurrentDictionary<string, List<IXEvent>>();
    }
}

