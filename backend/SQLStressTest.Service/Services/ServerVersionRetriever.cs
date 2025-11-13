using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for retrieving SQL Server version information.
/// Single Responsibility: Server version retrieval only.
/// </summary>
public class ServerVersionRetriever : IServerVersionRetriever
{
    private readonly ILogger<ServerVersionRetriever>? _logger;

    public ServerVersionRetriever(ILogger<ServerVersionRetriever>? logger = null)
    {
        _logger = logger;
    }

    /// <summary>
    /// Retrieves the SQL Server version from an open connection.
    /// </summary>
    public async Task<string?> GetServerVersionAsync(ISqlConnectionWrapper connection)
    {
        try
        {
            using var versionCommand = connection.CreateCommand("SELECT @@VERSION");
            var version = await versionCommand.ExecuteScalarAsync();
            return version?.ToString();
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Failed to get server version");
            return "Unable to retrieve";
        }
    }
}

