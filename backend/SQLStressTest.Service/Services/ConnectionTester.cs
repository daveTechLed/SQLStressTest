using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for testing database connections.
/// Single Responsibility: Connection testing orchestration only.
/// </summary>
public class ConnectionTester : IConnectionTester
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly IServerVersionRetriever _serverVersionRetriever;
    private readonly IUserInfoRetriever _userInfoRetriever;
    private readonly IDatabaseListRetriever _databaseListRetriever;
    private readonly ILogger<ConnectionTester>? _logger;

    public ConnectionTester(
        IConnectionStringBuilder connectionStringBuilder,
        ISqlConnectionFactory connectionFactory,
        IServerVersionRetriever serverVersionRetriever,
        IUserInfoRetriever userInfoRetriever,
        IDatabaseListRetriever databaseListRetriever,
        ILogger<ConnectionTester>? logger = null)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _serverVersionRetriever = serverVersionRetriever ?? throw new ArgumentNullException(nameof(serverVersionRetriever));
        _userInfoRetriever = userInfoRetriever ?? throw new ArgumentNullException(nameof(userInfoRetriever));
        _databaseListRetriever = databaseListRetriever ?? throw new ArgumentNullException(nameof(databaseListRetriever));
        _logger = logger;
    }

    /// <summary>
    /// Tests if a connection can be established.
    /// </summary>
    public async Task<bool> TestConnectionAsync(ConnectionConfig config)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        var connectionString = _connectionStringBuilder.Build(config);

        try
        {
            using var connection = _connectionFactory.CreateConnection(connectionString);
            await connection.OpenAsync();
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Tests connection and retrieves detailed information.
    /// </summary>
    public async Task<TestConnectionResponse> TestConnectionWithDetailsAsync(ConnectionConfig config)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        var response = new TestConnectionResponse { Success = false };
        var connectionString = _connectionStringBuilder.Build(config);

        try
        {
            using var connection = _connectionFactory.CreateConnection(connectionString);
            await connection.OpenAsync();
            
            response.Success = true;
            response.ServerName = connection.DataSource;

            // Get server version using dedicated service
            response.ServerVersion = await _serverVersionRetriever.GetServerVersionAsync(connection);

            // Get authenticated user using dedicated service
            response.AuthenticatedUser = await _userInfoRetriever.GetAuthenticatedUserAsync(connection);

            // Get database list using dedicated service
            response.Databases = await _databaseListRetriever.GetDatabaseListAsync(connection);

            return response;
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "TestConnectionWithDetailsAsync failed");
            response.Success = false;
            response.Error = ex.Message;
            return response;
        }
    }
}

