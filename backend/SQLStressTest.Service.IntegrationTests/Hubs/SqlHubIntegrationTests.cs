using Microsoft.AspNetCore.SignalR.Client;
using SQLStressTest.Service.IntegrationTests.Fixtures;
using Xunit;

namespace SQLStressTest.Service.IntegrationTests.Hubs;

public class SqlHubIntegrationTests : IClassFixture<WebApplicationFixture>
{
    private readonly WebApplicationFixture _factory;

    public SqlHubIntegrationTests(WebApplicationFixture factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Connect_ReceivesHeartbeat_OnConnection()
    {
        // Arrange
        var server = _factory.Server;
        var baseUrl = server.BaseAddress!.ToString().TrimEnd('/');
        var hubUrl = $"{baseUrl}/sqlhub";

        var connection = new HubConnectionBuilder()
            .WithUrl(hubUrl, options =>
            {
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
            })
            .Build();

        var heartbeatReceived = false;
        var tcs = new TaskCompletionSource<bool>();
        
        connection.On<object>("Heartbeat", (message) =>
        {
            heartbeatReceived = true;
            if (!tcs.Task.IsCompleted)
            {
                tcs.TrySetResult(true);
            }
        });

        // Act
        try
        {
            await connection.StartAsync();
            // Wait for heartbeat (should come immediately on connection)
            await Task.WhenAny(tcs.Task, Task.Delay(500)); // Fast timeout for tests
        }
        finally
        {
            await connection.DisposeAsync();
        }

        // Assert - heartbeat should be received
        Assert.True(heartbeatReceived, "Heartbeat message was not received");
    }

    [Fact]
    public async Task Connect_ReceivesPerformanceData_AfterConnection()
    {
        // Arrange
        var server = _factory.Server;
        var baseUrl = server.BaseAddress!.ToString().TrimEnd('/');
        var hubUrl = $"{baseUrl}/sqlhub";

        var connection = new HubConnectionBuilder()
            .WithUrl(hubUrl, options =>
            {
                options.HttpMessageHandlerFactory = _ => server.CreateHandler();
            })
            .Build();

        var performanceDataReceived = false;
        var tcs = new TaskCompletionSource<bool>();
        
        connection.On<object>("PerformanceData", (data) =>
        {
            performanceDataReceived = true;
            if (!tcs.Task.IsCompleted)
            {
                tcs.TrySetResult(true);
            }
        });

        // Act
        try
        {
            await connection.StartAsync();
            // Performance data streams every 1-2 seconds, wait up to 2 seconds for tests
            await Task.WhenAny(tcs.Task, Task.Delay(2000));
        }
        finally
        {
            await connection.DisposeAsync();
        }

        // Assert - performance data should be received (may take a few seconds)
        Assert.True(performanceDataReceived, "Performance data was not received within timeout period");
    }
}

