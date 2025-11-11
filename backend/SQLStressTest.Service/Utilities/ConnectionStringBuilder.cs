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
}

