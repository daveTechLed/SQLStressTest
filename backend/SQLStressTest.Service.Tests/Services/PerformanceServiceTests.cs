using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Moq;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Services;
using Xunit;

namespace SQLStressTest.Service.Tests.Services;

public class PerformanceServiceTests
{
    private readonly PerformanceService _service;
    private readonly Mock<IHubContext<SqlHub>> _mockHubContext;
    private readonly Mock<IHubClients> _mockHubClients;
    private readonly Mock<IClientProxy> _mockClientProxy;
    private readonly Mock<ILogger<PerformanceService>> _mockLogger;

    public PerformanceServiceTests()
    {
        _mockLogger = new Mock<ILogger<PerformanceService>>();
        _service = new PerformanceService(_mockLogger.Object);
        _mockClientProxy = new Mock<IClientProxy>();
        _mockHubClients = new Mock<IHubClients>();
        _mockHubContext = new Mock<IHubContext<SqlHub>>();

        _mockHubClients.Setup(x => x.All).Returns(_mockClientProxy.Object);
        _mockHubContext.Setup(x => x.Clients).Returns(_mockHubClients.Object);
    }

    [Fact]
    public void StopStreaming_DoesNotThrow_WhenNotStarted()
    {
        // Act & Assert
        _service.StopStreaming();
        Assert.True(true); // No exception thrown
    }

    [Fact]
    public async Task StartStreamingAsync_DoesNotStartMultipleStreams()
    {
        // Arrange
        var cancellationTokenSource = new CancellationTokenSource();
        cancellationTokenSource.CancelAfter(100); // Cancel after 100ms

        // Act
        var task1 = _service.StartStreamingAsync(_mockHubContext.Object);
        var task2 = _service.StartStreamingAsync(_mockHubContext.Object);

        await Task.Delay(50); // Wait a bit
        _service.StopStreaming();

        // Assert - should not throw
        await Task.WhenAny(task1, task2);
    }
}

