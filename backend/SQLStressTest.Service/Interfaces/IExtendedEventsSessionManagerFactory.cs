namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Factory interface for creating Extended Events session manager instances.
/// </summary>
public interface IExtendedEventsSessionManagerFactory
{
    IExtendedEventsSessionManager Create(
        string connectionString,
        string sessionName,
        bool isPersistentSession);
}

