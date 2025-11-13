namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for Extended Events reader service.
/// </summary>
public interface IExtendedEventsReaderService
{
    void InitializeReader();
    Task StartReadingAsync();
}

