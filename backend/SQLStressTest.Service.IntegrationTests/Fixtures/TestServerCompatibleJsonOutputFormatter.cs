using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Formatters;

namespace SQLStressTest.Service.IntegrationTests.Fixtures;

/// <summary>
/// Custom JSON output formatter that uses synchronous serialization
/// to work around .NET 9.0 TestServer PipeWriter.UnflushedBytes issue
/// </summary>
public class TestServerCompatibleJsonOutputFormatter : IOutputFormatter
{
    private readonly JsonSerializerOptions _jsonSerializerOptions;

    public TestServerCompatibleJsonOutputFormatter(JsonSerializerOptions jsonSerializerOptions)
    {
        _jsonSerializerOptions = jsonSerializerOptions;
    }

    public bool CanWriteResult(OutputFormatterCanWriteContext context)
    {
        // Check if the content type is JSON-related
        var contentType = context.ContentType.ToString();
        if (string.IsNullOrEmpty(contentType))
        {
            // If no content type specified, check if object is not null (likely JSON)
            return context.Object != null;
        }
        return contentType.Contains("application/json", StringComparison.OrdinalIgnoreCase) ||
               contentType.Contains("text/json", StringComparison.OrdinalIgnoreCase);
    }

    public async Task WriteAsync(OutputFormatterWriteContext context)
    {
        var response = context.HttpContext.Response;
        response.ContentType = "application/json; charset=utf-8";

        // Work around .NET 9.0 TestServer issue by using synchronous serialization
        // Serialize to a byte array first, then write to the response stream
        var objectType = context.Object?.GetType() ?? typeof(object);
        var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(context.Object, objectType, _jsonSerializerOptions);
        
        // Write to response body stream - this works with TestServer
        await response.Body.WriteAsync(jsonBytes, 0, jsonBytes.Length);
        await response.Body.FlushAsync();
    }
}

