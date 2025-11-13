namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for Extended Events reader.
/// </summary>
public interface IExtendedEventsReader : IDisposable
{
    Task StartSessionAsync();
    Task StopSessionAsync();
    Task StartReadingAsync();
    string SessionName { get; }
}

