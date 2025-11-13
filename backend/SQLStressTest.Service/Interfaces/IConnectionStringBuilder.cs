using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

public interface IConnectionStringBuilder
{
    string Build(ConnectionConfig config);
    
    /// <summary>
    /// Builds a connection string for Extended Events without TrustServerCertificate,
    /// as System.Data.SqlClient (used by XELiveEventStreamer) doesn't support this keyword.
    /// </summary>
    string BuildForExtendedEvents(ConnectionConfig config);
}

