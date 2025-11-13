using System.Collections.Concurrent;
using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Factory interface for creating Extended Events processor instances.
/// </summary>
public interface IExtendedEventsProcessorFactory
{
    IExtendedEventsProcessor Create(ConcurrentDictionary<string, List<IXEvent>> events);
}

