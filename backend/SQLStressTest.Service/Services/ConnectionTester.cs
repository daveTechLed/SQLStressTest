using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for testing database connections.
/// Single Responsibility: Connection testing orchestration only.
/// </summary>
public class ConnectionTester
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly ServerVersionRetriever _serverVersionRetriever;
    private readonly UserInfoRetriever _userInfoRetriever;
    private readonly DatabaseListRetriever _databaseListRetriever;
    private readonly ILogger<ConnectionTester>? _logger;

    public ConnectionTester(
        IConnectionStringBuilder connectionStringBuilder,
        ISqlConnectionFactory connectionFactory,
        ILogger<ConnectionTester>? logger = null,
        ServerVersionRetriever? serverVersionRetriever = null,
        UserInfoRetriever? userInfoRetriever = null,
        DatabaseListRetriever? databaseListRetriever = null)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _logger = logger;
        
        // Create services if not provided
        ILogger<ServerVersionRetriever>? versionLogger = null;
        ILogger<UserInfoRetriever>? userLogger = null;
        ILogger<DatabaseListRetriever>? dbLogger = null;
        if (logger != null)
        {
            var loggerFactory = Microsoft.Extensions.Logging.LoggerFactory.Create(builder => builder.AddConsole());
            versionLogger = loggerFactory.CreateLogger<ServerVersionRetriever>();
            userLogger = loggerFactory.CreateLogger<UserInfoRetriever>();
            dbLogger = loggerFactory.CreateLogger<DatabaseListRetriever>();
        }
        
        _serverVersionRetriever = serverVersionRetriever ?? new ServerVersionRetriever(versionLogger);
        _userInfoRetriever = userInfoRetriever ?? new UserInfoRetriever(userLogger);
        _databaseListRetriever = databaseListRetriever ?? new DatabaseListRetriever(dbLogger);
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

