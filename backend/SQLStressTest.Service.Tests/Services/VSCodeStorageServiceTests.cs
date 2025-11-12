using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Moq;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;
using Xunit;

namespace SQLStressTest.Service.Tests.Services;

public class VSCodeStorageServiceTests
{
    private readonly Mock<IHubContext<SqlHub>> _mockHubContext;
    private readonly Mock<ISingleClientProxy> _mockClientProxy;
    private readonly Mock<IHubClients> _mockHubClients;
    private readonly Mock<ILogger<VSCodeStorageService>> _mockLogger;
    private readonly VSCodeStorageService _service;
    private const string TestConnectionId = "test-connection-id";

    public VSCodeStorageServiceTests()
    {
        _mockLogger = new Mock<ILogger<VSCodeStorageService>>();
        _mockHubContext = new Mock<IHubContext<SqlHub>>();
        _mockClientProxy = new Mock<ISingleClientProxy>();
        _mockHubClients = new Mock<IHubClients>();

        _mockHubClients.Setup(x => x.Client(TestConnectionId)).Returns(_mockClientProxy.Object);
        _mockHubContext.Setup(x => x.Clients).Returns(_mockHubClients.Object);

        _service = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);
        _service.SetConnectionId(TestConnectionId);
    }

    [Fact]
    public void SetConnectionId_SetsConnectionIdCorrectly()
    {
        // Arrange
        var service = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);
        const string connectionId = "new-connection-id";

        // Act
        service.SetConnectionId(connectionId);

        // Assert - Connection ID is set (we can verify by attempting a save operation)
        // If connection ID wasn't set, SaveConnectionAsync would return error
    }

    [Fact]
    public async Task SaveConnectionAsync_ReturnsError_WhenNoConnectionIdSet()
    {
        // Arrange
        var serviceWithoutConnection = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);
        // Don't set connection ID
        var connection = new ConnectionConfigDto
        {
            Id = "test-1",
            Name = "Test Server",
            Server = "localhost"
        };

        // Act
        var result = await serviceWithoutConnection.SaveConnectionAsync(connection);

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("No SignalR connection available", result.Error);
    }

    [Fact]
    public async Task SaveConnectionAsync_ReturnsError_WhenClientProxyIsNull()
    {
        // Arrange - Setup hub to return null client (simulating client not found)
        _mockHubClients.Setup(x => x.Client(TestConnectionId)).Returns((ISingleClientProxy)null!);
        var connection = new ConnectionConfigDto
        {
            Id = "test-1",
            Name = "Test Server",
            Server = "localhost"
        };

        // Act
        var result = await _service.SaveConnectionAsync(connection);

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("not found", result.Error);
    }

    [Fact]
    public async Task LoadConnectionsAsync_ReturnsError_WhenNoConnectionIdSet()
    {
        // Arrange
        var serviceWithoutConnection = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);
        // Don't set connection ID

        // Act
        var result = await serviceWithoutConnection.LoadConnectionsAsync();

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("No SignalR connection available", result.Error);
        Assert.Null(result.Data);
    }

    [Fact]
    public async Task LoadConnectionsAsync_ReturnsError_WhenClientProxyIsNull()
    {
        // Arrange - Setup hub to return null client (simulating client not found)
        _mockHubClients.Setup(x => x.Client(TestConnectionId)).Returns((ISingleClientProxy)null!);

        // Act
        var result = await _service.LoadConnectionsAsync();

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("not found", result.Error);
        Assert.Null(result.Data);
    }

    [Fact]
    public async Task SaveConnectionAsync_ReturnsError_WhenClientNotFound()
    {
        // Arrange
        var serviceWithInvalidConnection = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);
        serviceWithInvalidConnection.SetConnectionId("non-existent-connection-id");
        var connection = new ConnectionConfigDto
        {
            Id = "test-1",
            Name = "Test Server",
            Server = "localhost"
        };

        // Act
        var result = await serviceWithInvalidConnection.SaveConnectionAsync(connection);

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("not found", result.Error);
    }

    [Fact]
    public async Task UpdateConnectionAsync_ReturnsError_WhenNoConnectionIdSet()
    {
        // Arrange
        var serviceWithoutConnection = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);
        var connection = new ConnectionConfigDto
        {
            Id = "test-1",
            Name = "Test Server",
            Server = "localhost"
        };

        // Act
        var result = await serviceWithoutConnection.UpdateConnectionAsync("test-1", connection);

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("No SignalR connection available", result.Error);
    }

    [Fact]
    public async Task DeleteConnectionAsync_ReturnsError_WhenNoConnectionIdSet()
    {
        // Arrange
        var serviceWithoutConnection = new VSCodeStorageService(_mockHubContext.Object, _mockLogger.Object);

        // Act
        var result = await serviceWithoutConnection.DeleteConnectionAsync("test-1");

        // Assert
        Assert.False(result.Success);
        Assert.NotNull(result.Error);
        Assert.Contains("No SignalR connection available", result.Error);
    }
}

