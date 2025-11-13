using System.Collections.Concurrent;
using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Factory interface for creating ExtendedEventsReader instances.
/// </summary>
public interface IExtendedEventsReaderFactory
{
    IExtendedEventsReader Create(
        string connectionString,
        string streamerConnectionString,
        CancellationToken cancellationToken,
        ConcurrentDictionary<string, List<IXEvent>> events,
        string? sessionName = null,
        bool isPersistentSession = false);
}

