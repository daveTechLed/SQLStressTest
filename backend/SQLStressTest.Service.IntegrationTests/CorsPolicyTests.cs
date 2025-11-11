using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SQLStressTest.Service.IntegrationTests.Fixtures;
using SQLStressTest.Service.IntegrationTests.Utilities;
using Xunit;

namespace SQLStressTest.Service.IntegrationTests;

public class CorsPolicyTests : TestBase, IClassFixture<WebApplicationFixture>
{
    private readonly HttpClient _client;
    private readonly WebApplicationFixture _factory;

    public CorsPolicyTests(WebApplicationFixture factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Theory]
    [InlineData("vscode-webview://authority/path")]
    [InlineData("vscode-webview://authority")]
    [InlineData("vscode-webview://")]
    [InlineData("http://localhost")]
    [InlineData("http://localhost:5000")]
    [InlineData("http://localhost:8080")]
    [InlineData("https://localhost")]
    [InlineData("https://localhost:5001")]
    [InlineData("http://127.0.0.1")]
    [InlineData("http://127.0.0.1:5000")]
    [InlineData("https://127.0.0.1")]
    [InlineData("https://127.0.0.1:5001")]
    [InlineData("file:///path/to/file")]
    [InlineData("file://localhost/path")]
    public async Task CORS_ShouldAllow_ValidOrigins(string origin)
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/sql/execute");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        // Act
        var response = await _client.SendAsync(request);

        // Assert
        Assert.True(
            response.StatusCode == HttpStatusCode.OK || response.StatusCode == HttpStatusCode.NoContent,
            $"Expected OK or NoContent for origin '{origin}', but got {response.StatusCode}");

        // Verify CORS headers are present
        Assert.True(
            response.Headers.Contains("Access-Control-Allow-Origin"),
            $"CORS headers should be present for origin '{origin}'");
        
        var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
        Assert.NotNull(allowOrigin);
        Assert.Equal(origin, allowOrigin);

        var allowCredentials = response.Headers.GetValues("Access-Control-Allow-Credentials").FirstOrDefault();
        Assert.Equal("true", allowCredentials);
    }

    [Fact]
    public async Task CORS_ShouldAllow_NullOrEmptyOrigin()
    {
        // Arrange - Test with no Origin header (null/empty origin)
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/sql/execute");
        request.Content = new StringContent("{\"connectionId\":\"test\",\"query\":\"SELECT 1\"}", 
            System.Text.Encoding.UTF8, "application/json");

        // Act
        var response = await _client.SendAsync(request);

        // Assert - Should not be 403 (null/empty origin should be allowed)
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        
        // For null/empty origins, CORS headers may or may not be present depending on implementation
        // The important thing is that the request is not rejected
    }

    [Theory]
    [InlineData("http://example.com")]
    [InlineData("https://malicious-site.com")]
    [InlineData("http://192.168.1.1")]
    [InlineData("http://10.0.0.1")]
    [InlineData("http://external-server.com:5000")]
    public async Task CORS_ShouldAllow_AllOrigins_InDevelopmentOrTesting(string origin)
    {
        // Arrange - Note: In development/testing environment, all origins are allowed
        // This test verifies the policy logic, but may pass in development mode
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/sql/execute");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        // Act
        var response = await _client.SendAsync(request);

        // Assert
        // In development/testing, all origins are allowed per our CORS policy
        var environment = _factory.Services.GetRequiredService<IWebHostEnvironment>();
        
        // Verify that in Testing/Development environment, all origins are allowed (permissive policy)
        Assert.True(
            environment.EnvironmentName == "Development" || environment.EnvironmentName == "Testing",
            $"This test expects Testing or Development environment, but got {environment.EnvironmentName}");
        
        // In development/testing, all origins should be allowed
        Assert.True(
            response.Headers.Contains("Access-Control-Allow-Origin"),
            $"CORS headers should be present for origin '{origin}' in {environment.EnvironmentName} environment");
        
        var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
        Assert.NotNull(allowOrigin);
        Assert.Equal(origin, allowOrigin);
        
        // Note: In production, these origins would be rejected, but we're testing in Testing environment
        // where the policy is permissive for easier development and debugging
    }

    [Fact]
    public async Task CORS_ShouldAllow_POST_Request_WithValidOrigin()
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/sql/execute");
        request.Headers.Add("Origin", "vscode-webview://authority");
        request.Content = new StringContent("{\"connectionId\":\"test\",\"query\":\"SELECT 1\"}", 
            System.Text.Encoding.UTF8, "application/json");

        // Act
        var response = await _client.SendAsync(request);

        // Assert - Should not be 403 (CORS should allow it)
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        
        // Verify CORS headers are present
        var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
        Assert.NotNull(allowOrigin);
        Assert.Equal("vscode-webview://authority", allowOrigin);
    }

    [Fact]
    public async Task CORS_ShouldAllow_AnyMethod()
    {
        // Arrange
        var methods = new[] { HttpMethod.Get, HttpMethod.Post, HttpMethod.Put, HttpMethod.Delete, HttpMethod.Patch };
        var origin = "http://localhost:5000";

        foreach (var method in methods)
        {
            var request = new HttpRequestMessage(method, "/api/sql/execute");
            request.Headers.Add("Origin", origin);
            
            if (method == HttpMethod.Post || method == HttpMethod.Put || method == HttpMethod.Patch)
            {
                request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
            }

            // Act
            var response = await _client.SendAsync(request);

            // Assert - Should not be 403 (CORS should allow it)
            Assert.True(
                response.StatusCode != HttpStatusCode.Forbidden,
                $"CORS should allow {method.Method} method, but got {response.StatusCode}");
            
            // Verify CORS headers are present
            var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
            Assert.NotNull(allowOrigin);
            Assert.Equal(origin, allowOrigin);
        }
    }

    [Fact]
    public async Task CORS_ShouldAllow_AnyHeader()
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/sql/execute");
        request.Headers.Add("Origin", "http://localhost:5000");
        request.Headers.Add("X-Custom-Header", "custom-value");
        request.Headers.Add("Authorization", "Bearer token123");
        request.Content = new StringContent("{\"connectionId\":\"test\",\"query\":\"SELECT 1\"}", 
            System.Text.Encoding.UTF8, "application/json");

        // Act
        var response = await _client.SendAsync(request);

        // Assert - Should not be 403 (CORS should allow any headers)
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        
        // Verify CORS headers are present
        var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
        Assert.NotNull(allowOrigin);
        Assert.Equal("http://localhost:5000", allowOrigin);
    }

    [Fact]
    public async Task CORS_ShouldAllow_Credentials()
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/sql/execute");
        request.Headers.Add("Origin", "vscode-webview://authority");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        // Act
        var response = await _client.SendAsync(request);

        // Assert
        var allowCredentials = response.Headers.GetValues("Access-Control-Allow-Credentials").FirstOrDefault();
        Assert.Equal("true", allowCredentials);
    }

    [Theory]
    [InlineData("vscode-webview://authority/path/to/resource")]
    [InlineData("vscode-webview://different-authority")]
    [InlineData("vscode-webview://authority:12345")]
    public async Task CORS_ShouldAllow_VariousVSCodeWebviewOrigins(string origin)
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/sql/execute");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");

        // Act
        var response = await _client.SendAsync(request);

        // Assert
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
        Assert.NotNull(allowOrigin);
        Assert.Equal(origin, allowOrigin);
    }

    [Theory]
    [InlineData("http://localhost")]
    [InlineData("http://localhost:")]
    [InlineData("http://localhost:8080")]
    [InlineData("http://localhost:3000")]
    [InlineData("https://localhost")]
    [InlineData("https://localhost:8443")]
    public async Task CORS_ShouldAllow_Localhost_WithVariousPorts(string origin)
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/sql/execute");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");

        // Act
        var response = await _client.SendAsync(request);

        // Assert
        Assert.NotEqual(HttpStatusCode.Forbidden, response.StatusCode);
        var allowOrigin = response.Headers.GetValues("Access-Control-Allow-Origin").FirstOrDefault();
        Assert.NotNull(allowOrigin);
        Assert.Equal(origin, allowOrigin);
    }
}

