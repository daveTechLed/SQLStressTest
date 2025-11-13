namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for Extended Events session manager.
/// </summary>
public interface IExtendedEventsSessionManager
{
    Task StartSessionAsync();
    Task StopSessionAsync();
    string SessionName { get; }
}

