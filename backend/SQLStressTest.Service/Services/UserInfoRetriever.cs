using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for retrieving authenticated user information from SQL Server.
/// Single Responsibility: User information retrieval only.
/// </summary>
public class UserInfoRetriever : IUserInfoRetriever
{
    private readonly ILogger<UserInfoRetriever>? _logger;

    public UserInfoRetriever(ILogger<UserInfoRetriever>? logger = null)
    {
        _logger = logger;
    }

    /// <summary>
    /// Retrieves the authenticated user information from an open connection.
    /// </summary>
    public async Task<string> GetAuthenticatedUserAsync(ISqlConnectionWrapper connection)
    {
        try
        {
            using var userCommand = connection.CreateCommand("SELECT SUSER_SNAME(), SYSTEM_USER, USER_NAME()");
            using var userReader = await userCommand.ExecuteReaderAsync();
            if (await userReader.ReadAsync())
            {
                // SUSER_SNAME() = SQL Server login name (domain\user for Windows Auth)
                // SYSTEM_USER = SQL Server login name
                // USER_NAME() = Database user name
                var sqlLogin = userReader.IsDBNull(0) ? null : userReader.GetValue(0)?.ToString();
                var systemUser = userReader.IsDBNull(1) ? null : userReader.GetValue(1)?.ToString();
                return sqlLogin ?? systemUser ?? "Unknown";
            }
            return "Unknown";
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "Failed to get authenticated user");
            return "Unable to retrieve";
        }
    }
}

