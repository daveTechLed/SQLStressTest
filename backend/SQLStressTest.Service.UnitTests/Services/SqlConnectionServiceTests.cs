using Moq;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;
using SQLStressTest.Service.Tests.Utilities;
using Xunit;

namespace SQLStressTest.Service.Tests.Services;

public class SqlConnectionServiceTests : TestBase
{
    private readonly Mock<IConnectionTester> _mockConnectionTester;
    private readonly Mock<IQueryRunner> _mockQueryRunner;
    private readonly Mock<IQueryResultSerializer> _mockResultSerializer;
    private readonly Mock<IQueryResultStorageHandler> _mockStorageHandler;
    private readonly SqlConnectionService _service;

    public SqlConnectionServiceTests()
    {
        _mockConnectionTester = new Mock<IConnectionTester>();
        _mockQueryRunner = new Mock<IQueryRunner>();
        _mockResultSerializer = new Mock<IQueryResultSerializer>();
        _mockStorageHandler = new Mock<IQueryResultStorageHandler>();
        _service = new SqlConnectionService(
            _mockConnectionTester.Object,
            _mockQueryRunner.Object,
            _mockResultSerializer.Object,
            _mockStorageHandler.Object);
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenConnectionTesterIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlConnectionService(null!, _mockQueryRunner.Object, _mockResultSerializer.Object, _mockStorageHandler.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenQueryRunnerIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlConnectionService(_mockConnectionTester.Object, null!, _mockResultSerializer.Object, _mockStorageHandler.Object));
    }

    [Fact]
    public async Task TestConnectionAsync_ThrowsArgumentNullException_WhenConfigIsNull()
    {
        // Arrange
        _mockConnectionTester.Setup(x => x.TestConnectionAsync(null!))
            .ThrowsAsync(new ArgumentNullException(nameof(ConnectionConfig)));

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => _service.TestConnectionAsync(null!));
    }

    [Fact]
    public async Task ExecuteQueryAsync_ThrowsArgumentNullException_WhenConfigIsNull()
    {
        // Arrange
        _mockQueryRunner.Setup(x => x.ExecuteQueryAsync(null!, It.IsAny<string>()))
            .ThrowsAsync(new ArgumentNullException(nameof(ConnectionConfig)));

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => 
            _service.ExecuteQueryAsync(null!, "SELECT 1"));
    }

    [Fact]
    public async Task ExecuteQueryAsync_ThrowsArgumentException_WhenQueryIsNullOrEmpty()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        _mockQueryRunner.Setup(x => x.ExecuteQueryAsync(It.IsAny<ConnectionConfig>(), It.IsAny<string>()))
            .ThrowsAsync(new ArgumentException("Query cannot be null or empty"));

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => 
            _service.ExecuteQueryAsync(config, null!));
        await Assert.ThrowsAsync<ArgumentException>(() => 
            _service.ExecuteQueryAsync(config, string.Empty));
        await Assert.ThrowsAsync<ArgumentException>(() => 
            _service.ExecuteQueryAsync(config, "   "));
    }

    [Fact]
    public async Task TestConnectionAsync_CallsConnectionTester()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        _mockConnectionTester.Setup(x => x.TestConnectionAsync(config))
            .ReturnsAsync(true);

        // Act
        var result = await _service.TestConnectionAsync(config);

        // Assert
        _mockConnectionTester.Verify(x => x.TestConnectionAsync(config), Times.Once);
        Assert.True(result);
    }

    [Fact]
    public async Task TestConnectionAsync_ReturnsFalse_WhenConnectionFails()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        _mockConnectionTester.Setup(x => x.TestConnectionAsync(config))
            .ReturnsAsync(false);

        // Act
        var result = await _service.TestConnectionAsync(config);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task ExecuteQueryAsync_CallsQueryRunner()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var query = "SELECT 1";
        var queryResponse = new QueryResponse { Success = true, Columns = new List<string> { "Column1" }, Rows = new List<List<object?>>() };
        _mockQueryRunner.Setup(x => x.ExecuteQueryAsync(config, query))
            .ReturnsAsync(queryResponse);
        _mockResultSerializer.Setup(x => x.BuildResultDataJson(It.IsAny<List<string>>(), It.IsAny<List<List<object?>>>()))
            .Returns("{\"columns\":[\"Column1\"],\"rows\":[]}");

        // Act
        var result = await _service.ExecuteQueryAsync(config, query);

        // Assert
        _mockQueryRunner.Verify(x => x.ExecuteQueryAsync(config, query), Times.Once);
        Assert.True(result.Success);
    }

    [Fact]
    public async Task TestConnectionWithDetailsAsync_ReturnsServerVersion_WhenSuccessful()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var testResponse = new TestConnectionResponse
        {
            Success = true,
            ServerVersion = "Microsoft SQL Server 2022",
            ServerName = "localhost",
            AuthenticatedUser = "DOMAIN\\user",
            Databases = new List<string> { "master", "tempdb" }
        };
        _mockConnectionTester.Setup(x => x.TestConnectionWithDetailsAsync(config))
            .ReturnsAsync(testResponse);

        // Act
        var result = await _service.TestConnectionWithDetailsAsync(config);

        // Assert
        _mockConnectionTester.Verify(x => x.TestConnectionWithDetailsAsync(config), Times.Once);
        Assert.True(result.Success);
        Assert.Equal("Microsoft SQL Server 2022", result.ServerVersion);
        Assert.Equal("localhost", result.ServerName);
        Assert.Equal("DOMAIN\\user", result.AuthenticatedUser);
        Assert.NotNull(result.Databases);
        Assert.Equal(2, result.Databases!.Count);
        Assert.Contains("master", result.Databases);
        Assert.Contains("tempdb", result.Databases);
    }

    [Fact]
    public async Task TestConnectionWithDetailsAsync_ReturnsAuthenticatedUser_WhenIntegratedSecurity()
    {
        // Arrange
        var config = CreateTestConnectionConfig(integratedSecurity: true);
        var testResponse = new TestConnectionResponse
        {
            Success = true,
            AuthenticatedUser = "DOMAIN\\currentuser"
        };
        _mockConnectionTester.Setup(x => x.TestConnectionWithDetailsAsync(config))
            .ReturnsAsync(testResponse);

        // Act
        var result = await _service.TestConnectionWithDetailsAsync(config);

        // Assert
        Assert.True(result.Success);
        Assert.NotNull(result.AuthenticatedUser);
        Assert.Contains("\\", result.AuthenticatedUser); // Should be domain\user format for Windows Auth
    }

    [Fact]
    public async Task TestConnectionWithDetailsAsync_HandlesInvalidCredentials()
    {
        // Arrange
        var config = CreateTestConnectionConfig(integratedSecurity: false);
        var testResponse = new TestConnectionResponse
        {
            Success = false,
            Error = "Login failed for user 'sa'."
        };
        _mockConnectionTester.Setup(x => x.TestConnectionWithDetailsAsync(config))
            .ReturnsAsync(testResponse);

        // Act
        var result = await _service.TestConnectionWithDetailsAsync(config);

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("Login failed", result.Error);
    }
}

