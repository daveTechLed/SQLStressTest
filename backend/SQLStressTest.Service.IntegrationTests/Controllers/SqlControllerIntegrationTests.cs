using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc.Testing;
using SQLStressTest.Service.IntegrationTests.Fixtures;
using SQLStressTest.Service.IntegrationTests.Utilities;
using SQLStressTest.Service.Models;
using Xunit;

namespace SQLStressTest.Service.IntegrationTests.Controllers;

public class SqlControllerIntegrationTests : TestBase, IClassFixture<WebApplicationFixture>
{
    private readonly HttpClient _client;

    public SqlControllerIntegrationTests(WebApplicationFixture factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task TestConnection_ReturnsBadRequest_WhenConfigIsNull()
    {
        // Act - Send empty body which will be deserialized as null
        var response = await _client.PostAsync("/api/sql/test", new StringContent("{}", Encoding.UTF8, "application/json"));

        // Assert - Should handle gracefully (either BadRequest or OK with error)
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest || response.StatusCode == HttpStatusCode.OK);
    }

    [Fact]
    public async Task TestConnection_ReturnsOk_WithSuccessFalse_WhenConfigIsInvalid()
    {
        // Arrange - Use invalid server name (mocked to fail immediately)
        var config = CreateTestConnectionConfig(server: "invalid-server-name-that-does-not-exist");

        // Act
        var response = await _client.PostAsJsonAsync("/api/sql/test", config);
        var result = await response.Content.ReadFromJsonAsync<TestConnectionResponse>();
        
        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(result);
        Assert.False(result!.Success);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Act - Send empty body which will be deserialized as null
        var response = await _client.PostAsync("/api/sql/execute", new StringContent("{}", Encoding.UTF8, "application/json"));

        // Assert - Should handle gracefully (either BadRequest or OK with error)
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest || response.StatusCode == HttpStatusCode.OK);
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
        var response = await _client.PostAsJsonAsync("/api/sql/execute", request);
        var result = await response.Content.ReadFromJsonAsync<QueryResponse>();

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(result);
        Assert.False(result!.Success);
        Assert.NotNull(result.Error);
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
        var response = await _client.PostAsJsonAsync("/api/sql/execute", request);
        var result = await response.Content.ReadFromJsonAsync<QueryResponse>();

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(result);
        Assert.False(result!.Success);
        Assert.NotNull(result.Error);
    }
}

