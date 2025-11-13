using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for Extended Events processor.
/// </summary>
public interface IExtendedEventsProcessor
{
    void ProcessEvent(IXEvent xevent);
}

