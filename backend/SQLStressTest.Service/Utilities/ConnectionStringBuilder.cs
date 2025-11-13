using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Utilities;

public class ConnectionStringBuilder : IConnectionStringBuilder
{
    public string Build(ConnectionConfig config)
    {
        var builder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder
        {
            DataSource = config.Port.HasValue 
                ? $"{config.Server},{config.Port.Value}" 
                : config.Server,
            InitialCatalog = config.Database ?? "master",
            IntegratedSecurity = config.IntegratedSecurity
        };

        if (!config.IntegratedSecurity && !string.IsNullOrEmpty(config.Username))
        {
            builder.UserID = config.Username;
            builder.Password = config.Password ?? string.Empty;
        }

        builder.TrustServerCertificate = true; // For development
        
        // Use shorter timeout in testing environment for faster test execution
        var isTesting = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Testing";
        builder.ConnectTimeout = isTesting ? 1 : 30;
        
        // For testing, also set CommandTimeout to prevent long-running queries
        if (isTesting)
        {
            // This will be set on the SqlCommand, but we can't do it here
            // The connection timeout of 1 second should be sufficient
        }

        return builder.ConnectionString;
    }

    /// <summary>
    /// Builds a connection string for Extended Events without TrustServerCertificate.
    /// System.Data.SqlClient (used by XELiveEventStreamer) doesn't support TrustServerCertificate keyword.
    /// </summary>
    public string BuildForExtendedEvents(ConnectionConfig config)
    {
        var builder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder
        {
            DataSource = config.Port.HasValue 
                ? $"{config.Server},{config.Port.Value}" 
                : config.Server,
            InitialCatalog = config.Database ?? "master",
            IntegratedSecurity = config.IntegratedSecurity
        };

        if (!config.IntegratedSecurity && !string.IsNullOrEmpty(config.Username))
        {
            builder.UserID = config.Username;
            builder.Password = config.Password ?? string.Empty;
        }

        // NOTE: Do NOT set TrustServerCertificate here - System.Data.SqlClient doesn't support it
        // Extended Events will work without it, or you can configure the server to trust the certificate
        
        // Use shorter timeout in testing environment for faster test execution
        var isTesting = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Testing";
        builder.ConnectTimeout = isTesting ? 1 : 30;

        return builder.ConnectionString;
    }
}

