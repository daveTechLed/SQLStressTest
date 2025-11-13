using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for retrieving the list of databases from SQL Server.
/// Single Responsibility: Database list retrieval only.
/// </summary>
public class DatabaseListRetriever : IDatabaseListRetriever
{
    private readonly ILogger<DatabaseListRetriever>? _logger;

    public DatabaseListRetriever(ILogger<DatabaseListRetriever>? logger = null)
    {
        _logger = logger;
    }

    /// <summary>
    /// Retrieves the list of online databases from an open connection.
    /// </summary>
    public async Task<List<string>> GetDatabaseListAsync(ISqlConnectionWrapper connection)
    {
        try
        {
            var databases = new List<string>();
            using var dbCommand = connection.CreateCommand("SELECT name FROM sys.databases WHERE state = 0 ORDER BY name"); // state 0 = ONLINE
            using var dbReader = await dbCommand.ExecuteReaderAsync();
            while (await dbReader.ReadAsync())
            {
                if (!dbReader.IsDBNull(0))
                {
                    databases.Add(dbReader.GetValue(0)?.ToString() ?? string.Empty);
                }
            }
            return databases;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Failed to get database list");
            return new List<string>();
        }
    }
}

