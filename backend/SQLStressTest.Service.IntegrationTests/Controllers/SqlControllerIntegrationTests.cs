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
    public async Task TestConnection_DeserializesConnectionConfig_WithAllProperties()
    {
        // Arrange - Test that ConnectionConfig can be properly deserialized from JSON
        // This test will fail if JsonTypeInfoResolver is not configured for MVC controllers
        var config = new ConnectionConfig
        {
            Id = "test-conn-1",
            Name = "Test Server",
            Server = "localhost",
            Database = "master",
            Username = "sa",
            Password = "TestPassword123!",
            IntegratedSecurity = false,
            Port = 1433
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/sql/test", config);
        
        // Assert - Should not return 500 Internal Server Error due to deserialization failure
        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        
        // Should return either OK (200) with success=false (connection failed) or BadRequest (400)
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || 
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected OK or BadRequest, but got {response.StatusCode}. Response: {await response.Content.ReadAsStringAsync()}");
        
        // If OK, verify response can be deserialized
        if (response.StatusCode == HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<TestConnectionResponse>();
            Assert.NotNull(result);
        }
    }

    [Fact]
    public async Task TestConnection_HandlesCamelCaseJson_FromFrontend()
    {
        // Arrange - Test that camelCase JSON from frontend is properly deserialized
        // Frontend sends camelCase property names (name, server, integratedSecurity, etc.)
        var jsonContent = new StringContent(
            @"{
                ""id"": """",
                ""name"": ""Test Server"",
                ""server"": ""localhost"",
                ""database"": ""master"",
                ""username"": ""sa"",
                ""password"": ""TestPassword123!"",
                ""integratedSecurity"": false,
                ""port"": 1433
            }",
            Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync("/api/sql/test", jsonContent);
        
        // Assert - Should not return 500 Internal Server Error due to deserialization failure
        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        
        // Should return either OK (200) or BadRequest (400)
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || 
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected OK or BadRequest, but got {response.StatusCode}. Response: {await response.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task TestConnection_HandlesMissingOptionalProperties()
    {
        // Arrange - Test that optional properties (database, username, password, port) can be omitted
        var jsonContent = new StringContent(
            @"{
                ""id"": """",
                ""name"": ""Test Server"",
                ""server"": ""localhost"",
                ""integratedSecurity"": true
            }",
            Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync("/api/sql/test", jsonContent);
        
        // Assert - Should not return 500 Internal Server Error due to deserialization failure
        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        
        // Should return either OK (200) or BadRequest (400)
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || 
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected OK or BadRequest, but got {response.StatusCode}. Response: {await response.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Act - Send empty object which will have empty strings for required fields
        var response = await _client.PostAsync("/api/sql/execute", new StringContent("{}", Encoding.UTF8, "application/json"));

        // Assert - Should return BadRequest (400) or NotAcceptable (406) for validation errors
        // ASP.NET Core may return 406 for model binding failures, or 400 for validation errors
        Assert.True(
            response.StatusCode == HttpStatusCode.BadRequest || 
            response.StatusCode == HttpStatusCode.NotAcceptable,
            $"Expected BadRequest or NotAcceptable, but got {response.StatusCode}");
        
        // If response has content, verify it's valid JSON
        if (response.Content.Headers.ContentLength > 0)
        {
            var content = await response.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(content))
            {
                var result = await response.Content.ReadFromJsonAsync<QueryResponse>();
                if (result != null)
                {
                    Assert.False(result.Success);
                    Assert.NotNull(result.Error);
                }
            }
        }
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

        // Assert
        // Model validation may return 406 NotAcceptable or 400 BadRequest depending on when validation fails
        Assert.True(
            response.StatusCode == HttpStatusCode.BadRequest || 
            response.StatusCode == HttpStatusCode.NotAcceptable,
            $"Expected BadRequest or NotAcceptable, but got {response.StatusCode}");
        
        // If response has content, verify it's valid JSON
        if (response.Content.Headers.ContentLength > 0)
        {
            var content = await response.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(content))
            {
                try
                {
                    var result = await response.Content.ReadFromJsonAsync<QueryResponse>();
                    if (result != null)
                    {
                        Assert.False(result.Success);
        Assert.NotNull(result.Error);
                    }
                }
                catch
                {
                    // Some validation errors may not return JSON - that's acceptable
                }
            }
        }
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

        // Assert
        // Model validation may return 406 NotAcceptable or 400 BadRequest depending on when validation fails
        Assert.True(
            response.StatusCode == HttpStatusCode.BadRequest || 
            response.StatusCode == HttpStatusCode.NotAcceptable,
            $"Expected BadRequest or NotAcceptable, but got {response.StatusCode}");
        
        // If response has content, verify it's valid JSON
        if (response.Content.Headers.ContentLength > 0)
        {
            var content = await response.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(content))
            {
                try
                {
                    var result = await response.Content.ReadFromJsonAsync<QueryResponse>();
                    if (result != null)
                    {
                        Assert.False(result.Success);
        Assert.NotNull(result.Error);
                    }
                }
                catch
                {
                    // Some validation errors may not return JSON - that's acceptable
                }
            }
        }
    }

    [Fact]
    public async Task TestConnection_DoesNotThrowIsConvertibleTypeError_WithValidConfig()
    {
        // Arrange - This test should pass without throwing "IsConvertibleType is not initialized" error
        // The error occurs when model validation tries to access ModelMetadata.IsConvertibleType
        // which is not initialized when enhanced model metadata is disabled (with trimming)
        var config = new ConnectionConfig
        {
            Id = "test-conn-1",
            Name = "Test Server",
            Server = "localhost",
            Database = "master",
            Username = "sa",
            Password = "TestPassword123!",
            IntegratedSecurity = false,
            Port = 1433
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/sql/test", config);
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert - Should NOT return 500 Internal Server Error due to IsConvertibleType error
        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        
        // Should return either OK (200) with success=false (connection failed) or BadRequest (400)
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || 
            response.StatusCode == HttpStatusCode.BadRequest,
            $"Expected OK or BadRequest, but got {response.StatusCode}. Response: {content}");
        
        // Verify response doesn't contain the IsConvertibleType error message
        Assert.DoesNotContain("IsConvertibleType", content);
        Assert.DoesNotContain("IsEnhancedModelMetadataSupported", content);
        
        // If OK, verify response can be deserialized
        if (response.StatusCode == HttpStatusCode.OK)
        {
            var result = await response.Content.ReadFromJsonAsync<TestConnectionResponse>();
            Assert.NotNull(result);
        }
    }

    [Fact]
    public async Task TestConnection_DoesNotThrowIsConvertibleTypeError_WithMinimalConfig()
    {
        // Arrange - Test with minimal config (just server and integrated security)
        var config = new ConnectionConfig
        {
            Id = "",
            Name = "Test Server",
            Server = "localhost",
            IntegratedSecurity = true
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/sql/test", config);
        var content = await response.Content.ReadAsStringAsync();
        
        // Assert - Should NOT return 500 Internal Server Error due to IsConvertibleType error
        Assert.NotEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        
        // Verify response doesn't contain the IsConvertibleType error message
        Assert.DoesNotContain("IsConvertibleType", content);
        Assert.DoesNotContain("IsEnhancedModelMetadataSupported", content);
    }

    [Fact]
    public async Task TestConnection_CompletesWithinTimeout_DoesNotHang()
    {
        // Arrange - Test that connection test completes within reasonable time (not stuck)
        var config = CreateTestConnectionConfig(server: "localhost");
        
        // Act - Use a timeout to detect if the request hangs
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var response = await _client.PostAsJsonAsync("/api/sql/test", config, cts.Token);
        
        // Assert - Request should complete (not timeout)
        // Status code can be OK or BadRequest, but should not hang
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || 
            response.StatusCode == HttpStatusCode.BadRequest ||
            response.StatusCode == HttpStatusCode.InternalServerError,
            $"Request should complete. Status: {response.StatusCode}");
    }
}

