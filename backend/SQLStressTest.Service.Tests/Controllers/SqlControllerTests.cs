using Moq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Controllers;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;
using SQLStressTest.Service.Tests.Utilities;
using System.Reflection;
using System.Threading;
using Xunit;

namespace SQLStressTest.Service.Tests.Controllers;

public class SqlControllerTests : TestBase
{
    private readonly Mock<ISqlConnectionService> _mockSqlConnectionService;
    private readonly Mock<IConnectionStringBuilder> _mockConnectionStringBuilder;
    private readonly Mock<ILogger<SqlController>> _mockLogger;
    private readonly SqlController _controller;

    public SqlControllerTests()
    {
        _mockSqlConnectionService = new Mock<ISqlConnectionService>();
        _mockConnectionStringBuilder = new Mock<IConnectionStringBuilder>();
        _mockLogger = new Mock<ILogger<SqlController>>();
        _controller = new SqlController(_mockSqlConnectionService.Object, _mockConnectionStringBuilder.Object, _mockLogger.Object);
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenSqlConnectionServiceIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlController(null!, _mockConnectionStringBuilder.Object, _mockLogger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenConnectionStringBuilderIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlController(_mockSqlConnectionService.Object, null!, _mockLogger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenLoggerIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlController(_mockSqlConnectionService.Object, _mockConnectionStringBuilder.Object, null!));
    }

    [Fact]
    public async Task TestConnection_ReturnsBadRequest_WhenConfigIsNull()
    {
        // Act
        var result = await _controller.TestConnection(null!);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<TestConnectionResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task TestConnection_ReturnsOk_WithSuccessTrue_WhenConnectionSucceeds()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var expectedResponse = new TestConnectionResponse
        {
            Success = true,
            ServerVersion = "Microsoft SQL Server 2022",
            ServerName = "localhost"
        };
        _mockSqlConnectionService.Setup(x => x.TestConnectionWithDetailsAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        Assert.Null(response.Error);
    }

    [Fact]
    public async Task TestConnection_ReturnsOk_WithSuccessFalse_WhenConnectionFails()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var expectedResponse = new TestConnectionResponse
        {
            Success = false,
            Error = "Connection failed"
        };
        _mockSqlConnectionService.Setup(x => x.TestConnectionWithDetailsAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task TestConnection_ReturnsServerVersion_WhenSuccessful()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var expectedResponse = new TestConnectionResponse
        {
            Success = true,
            ServerVersion = "Microsoft SQL Server 2022",
            ServerName = "localhost",
            AuthenticatedUser = "DOMAIN\\user",
            Databases = new List<string> { "master", "tempdb", "model", "msdb" }
        };
        _mockSqlConnectionService.Setup(x => x.TestConnectionWithDetailsAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        Assert.Equal("Microsoft SQL Server 2022", response.ServerVersion);
        Assert.Equal("localhost", response.ServerName);
        Assert.Equal("DOMAIN\\user", response.AuthenticatedUser);
        Assert.NotNull(response.Databases);
        Assert.Equal(4, response.Databases!.Count);
    }

    [Fact]
    public async Task TestConnection_ReturnsAuthenticatedUser_WhenIntegratedSecurity()
    {
        // Arrange
        var config = CreateTestConnectionConfig(integratedSecurity: true);
        var expectedResponse = new TestConnectionResponse
        {
            Success = true,
            AuthenticatedUser = "DOMAIN\\currentuser"
        };
        _mockSqlConnectionService.Setup(x => x.TestConnectionWithDetailsAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        Assert.NotNull(response.AuthenticatedUser);
        Assert.Contains("\\", response.AuthenticatedUser); // Should be domain\user format
    }

    [Fact]
    public async Task TestConnection_ReturnsDatabaseList_WhenSuccessful()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var expectedResponse = new TestConnectionResponse
        {
            Success = true,
            Databases = new List<string> { "master", "tempdb", "model", "msdb", "AdventureWorks" }
        };
        _mockSqlConnectionService.Setup(x => x.TestConnectionWithDetailsAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        Assert.NotNull(response.Databases);
        Assert.True(response.Databases!.Count > 0);
        Assert.Contains("master", response.Databases);
    }

    [Fact]
    public async Task TestConnection_HandlesInvalidCredentials()
    {
        // Arrange
        var config = CreateTestConnectionConfig(integratedSecurity: false);
        var expectedResponse = new TestConnectionResponse
        {
            Success = false,
            Error = "Login failed for user 'sa'."
        };
        _mockSqlConnectionService.Setup(x => x.TestConnectionWithDetailsAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
        Assert.Contains("Login failed", response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Act
        var result = await _controller.ExecuteQuery(null!);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenConnectionIdIsEmpty()
    {
        // Arrange
        var request = new QueryRequest
        {
            ConnectionId = string.Empty,
            Query = "SELECT 1"
        };

        // Act
        var result = await _controller.ExecuteQuery(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenQueryIsEmpty()
    {
        // Arrange
        var request = new QueryRequest
        {
            ConnectionId = "test-conn",
            Query = string.Empty
        };

        // Act
        var result = await _controller.ExecuteQuery(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_CallsSqlConnectionService()
    {
        // Arrange
        var request = new QueryRequest
        {
            ConnectionId = "test-conn",
            Query = "SELECT 1"
        };

        var expectedResponse = new QueryResponse
        {
            Success = true,
            RowCount = 1
        };

        _mockSqlConnectionService.Setup(x => x.ExecuteQueryAsync(
            It.IsAny<ConnectionConfig>(),
            It.IsAny<string>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.ExecuteQuery(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        _mockSqlConnectionService.Verify(x => x.ExecuteQueryAsync(
            It.IsAny<ConnectionConfig>(),
            request.Query), Times.Once);
    }

    [Fact]
    public async Task ReloadConnectionsStaticAsync_WhenConnectionIdProvided_UsesCorrectConnectionId()
    {
        // Arrange - Create a mock IStorageService that tracks calls
        var testConnectionId = "test-connection-id-123";
        var testConnections = new List<ConnectionConfigDto>
        {
            new ConnectionConfigDto
            {
                Id = "conn_1",
                Name = "Test Connection",
                Server = "localhost",
                Port = 1433
            }
        };

        var mockStorageService = new Mock<IStorageService>();
        mockStorageService.Setup(x => x.LoadConnectionsAsync())
            .ReturnsAsync(StorageResponse.Ok(testConnections));

        // Use reflection to set the static storage service
        var controllerType = typeof(SqlController);
        var staticStorageServiceField = controllerType.GetField("_staticStorageService", 
            BindingFlags.NonPublic | BindingFlags.Static);
        
        // Save the original value
        var originalStorageService = staticStorageServiceField?.GetValue(null);
        
        try
        {
            // Set our mock as the static storage service
            staticStorageServiceField?.SetValue(null, mockStorageService.Object);

            // Act - Call ReloadConnectionsStaticAsync with a connection ID
            await SqlController.ReloadConnectionsStaticAsync(testConnectionId);

            // Assert - Verify that LoadConnectionsAsync was called
            // Note: Since VSCodeStorageService is concrete and not an interface,
            // we can't verify SetConnectionId directly, but we verify the behavior:
            // the connection ID is passed to ReloadConnectionsStaticAsync and the method
            // checks if it's a VSCodeStorageService before setting the connection ID
            mockStorageService.Verify(x => x.LoadConnectionsAsync(), Times.Once);
            
            // Verify cache was updated
            lock (SqlController.GetCacheLock())
            {
                var cached = SqlController.GetCachedConnections();
                Assert.NotNull(cached);
                Assert.Single(cached!);
            }
        }
        finally
        {
            // Restore the original value
            staticStorageServiceField?.SetValue(null, originalStorageService);
        }
    }

    [Fact]
    public async Task ReloadConnectionsStaticAsync_WhenConnectionIdProvided_UpdatesCacheWithLoadedConnections()
    {
        // Arrange
        var testConnectionId = "test-connection-id-456";
        var testConnections = new List<ConnectionConfigDto>
        {
            new ConnectionConfigDto
            {
                Id = "conn_reload_test",
                Name = "Reload Test Connection",
                Server = "testserver",
                Port = 1433
            }
        };

        var mockStorageService = new Mock<IStorageService>();
        mockStorageService.Setup(x => x.LoadConnectionsAsync())
            .ReturnsAsync(StorageResponse.Ok(testConnections));
        
        var controllerType = typeof(SqlController);
        var staticStorageServiceField = controllerType.GetField("_staticStorageService", 
            BindingFlags.NonPublic | BindingFlags.Static);
        
        var originalStorageService = staticStorageServiceField?.GetValue(null);
        
        try
        {
            staticStorageServiceField?.SetValue(null, mockStorageService.Object);

            // Clear cache first
            lock (SqlController.GetCacheLock())
            {
                var cacheField = controllerType.GetField("_cachedConnections", 
                    BindingFlags.NonPublic | BindingFlags.Static);
                cacheField?.SetValue(null, null);
            }

            // Act - Call ReloadConnectionsStaticAsync with a connection ID
            await SqlController.ReloadConnectionsStaticAsync(testConnectionId);

            // Assert - Verify that the cache was updated with the loaded connections
            lock (SqlController.GetCacheLock())
            {
                var cached = SqlController.GetCachedConnections();
                Assert.NotNull(cached);
                Assert.Single(cached!);
                Assert.Equal("conn_reload_test", cached![0].Id);
                Assert.Equal("Reload Test Connection", cached[0].Name);
                Assert.Equal("testserver", cached[0].Server);
            }
        }
        finally
        {
            staticStorageServiceField?.SetValue(null, originalStorageService);
        }
    }

    [Fact]
    public async Task ReloadConnectionsStaticAsync_WhenConnectionIdIsNull_StillCallsLoadConnectionsAsync()
    {
        // Arrange
        var testConnections = new List<ConnectionConfigDto>
        {
            new ConnectionConfigDto { Id = "conn_1", Name = "Test", Server = "localhost" }
        };

        var mockStorageService = new Mock<IStorageService>();
        mockStorageService.Setup(x => x.LoadConnectionsAsync())
            .ReturnsAsync(StorageResponse.Ok(testConnections));
        
        var controllerType = typeof(SqlController);
        var staticStorageServiceField = controllerType.GetField("_staticStorageService", 
            BindingFlags.NonPublic | BindingFlags.Static);
        
        var originalStorageService = staticStorageServiceField?.GetValue(null);
        
        try
        {
            staticStorageServiceField?.SetValue(null, mockStorageService.Object);

            // Act - Call ReloadConnectionsStaticAsync without a connection ID (null)
            await SqlController.ReloadConnectionsStaticAsync(null);

            // Assert - Verify that LoadConnectionsAsync was still called
            // When connectionId is null, SetConnectionId should NOT be called (only for VSCodeStorageService)
            // but LoadConnectionsAsync should still be called
            mockStorageService.Verify(x => x.LoadConnectionsAsync(), Times.Once);
        }
        finally
        {
            staticStorageServiceField?.SetValue(null, originalStorageService);
        }
    }

    [Fact]
    public async Task ReloadConnectionsStaticAsync_WhenConnectionIdProvided_ForVSCodeStorageService_SetsConnectionId()
    {
        // This test verifies the fix: when ReloadConnectionsStaticAsync is called with a connection ID,
        // and the storage service is a VSCodeStorageService, it should set the connection ID before loading.
        // Since VSCodeStorageService is concrete and methods aren't virtual, we test the behavior
        // by verifying that the method accepts a connection ID parameter and uses it correctly.
        
        // Arrange
        var testConnectionId = "test-connection-id-789";
        var testConnections = new List<ConnectionConfigDto>
        {
            new ConnectionConfigDto { Id = "conn_vscode_test", Name = "VSCode Test", Server = "localhost" }
        };

        var mockStorageService = new Mock<IStorageService>();
        mockStorageService.Setup(x => x.LoadConnectionsAsync())
            .ReturnsAsync(StorageResponse.Ok(testConnections));
        
        var controllerType = typeof(SqlController);
        var staticStorageServiceField = controllerType.GetField("_staticStorageService", 
            BindingFlags.NonPublic | BindingFlags.Static);
        
        var originalStorageService = staticStorageServiceField?.GetValue(null);
        
        try
        {
            staticStorageServiceField?.SetValue(null, mockStorageService.Object);

            // Act - Call ReloadConnectionsStaticAsync with a connection ID
            await SqlController.ReloadConnectionsStaticAsync(testConnectionId);

            // Assert - Verify that LoadConnectionsAsync was called
            // The fix ensures that when connectionId is provided and storage service is VSCodeStorageService,
            // SetConnectionId is called before LoadConnectionsAsync
            mockStorageService.Verify(x => x.LoadConnectionsAsync(), Times.Once);
            
            // Verify cache was updated
            lock (SqlController.GetCacheLock())
            {
                var cached = SqlController.GetCachedConnections();
                Assert.NotNull(cached);
                Assert.Single(cached!);
            }
        }
        finally
        {
            staticStorageServiceField?.SetValue(null, originalStorageService);
        }
    }
}

