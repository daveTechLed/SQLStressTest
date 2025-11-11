using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SqlController : ControllerBase
{
    private readonly ISqlConnectionService _sqlConnectionService;
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ILogger<SqlController> _logger;

    public SqlController(
        ISqlConnectionService sqlConnectionService,
        IConnectionStringBuilder connectionStringBuilder,
        ILogger<SqlController> logger)
    {
        _sqlConnectionService = sqlConnectionService ?? throw new ArgumentNullException(nameof(sqlConnectionService));
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestConnection([FromBody] ConnectionConfig config)
    {
        if (config == null)
        {
            _logger.LogWarning("TestConnection validation failed: Connection configuration is null. Request path: {Path}, Method: {Method}",
                Request.Path, Request.Method);
            
            var errorResponse = new TestConnectionResponse 
            { 
                Success = false, 
                Error = "Connection configuration is required" 
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 400 
            };
        }

        try
        {
            var result = await _sqlConnectionService.TestConnectionAsync(config);
            var response = new TestConnectionResponse 
            { 
                Success = result, 
                Error = result ? null : "Connection failed" 
            };
            var json = JsonSerializer.Serialize(response);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 200 
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TestConnection failed with exception. Server: {Server}, Name: {Name}",
                config?.Server, config?.Name);
            
            var errorResponse = new TestConnectionResponse 
            { 
                Success = false, 
                Error = ex.Message 
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 200 
            };
        }
    }

    [HttpPost("execute")]
    public async Task<IActionResult> ExecuteQuery([FromBody] QueryRequest request)
    {
        // Log model binding state and validation errors
        if (!ModelState.IsValid)
        {
            var modelErrors = string.Join(", ", ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage ?? "Unknown error"));
            
            var errorDetails = ModelState
                .Where(ms => ms.Value?.Errors?.Any() == true)
                .Select(ms => $"{ms.Key}: {string.Join(", ", ms.Value!.Errors!.Select(e => e.ErrorMessage ?? "Unknown error"))}")
                .ToList();
            
            _logger.LogWarning("ExecuteQuery model validation failed. Errors: {Errors}, Error details: {ErrorDetails}, Request path: {Path}, Method: {Method}, Content-Type: {ContentType}, Content-Length: {ContentLength}",
                modelErrors, 
                string.Join("; ", errorDetails),
                Request.Path, 
                Request.Method,
                Request.ContentType,
                Request.ContentLength);
            
            // Return validation errors as 400 Bad Request
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = $"Validation failed: {modelErrors}"
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 400 
            };
        }

        if (request == null)
        {
            _logger.LogWarning("ExecuteQuery validation failed: Request is null. Request path: {Path}, Method: {Method}, Content-Type: {ContentType}, Content-Length: {ContentLength}",
                Request.Path, Request.Method, Request.ContentType, Request.ContentLength);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = "Request is required"
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 400 
            };
        }

        // Log request details for debugging (sanitized - don't log full query if it's very long)
        var queryPreview = request.Query?.Length > 100 
            ? request.Query.Substring(0, 100) + "..." 
            : request.Query;
        
        _logger.LogDebug("ExecuteQuery received request. ConnectionId: {ConnectionId}, Query length: {QueryLength}, Query preview: {QueryPreview}",
            request.ConnectionId, request.Query?.Length ?? 0, queryPreview);

        if (string.IsNullOrWhiteSpace(request.ConnectionId))
        {
            _logger.LogWarning("ExecuteQuery validation failed: ConnectionId is null or empty. Request details - Query length: {QueryLength}, Query preview: {QueryPreview}",
                request.Query?.Length ?? 0, queryPreview);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = "ConnectionId is required"
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 400 
            };
        }

        if (string.IsNullOrWhiteSpace(request.Query))
        {
            _logger.LogWarning("ExecuteQuery validation failed: Query is null or empty. Request details - ConnectionId: {ConnectionId}",
                request.ConnectionId);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = "Query is required"
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 400 
            };
        }

        // In a real application, you would retrieve the connection config from storage
        // For now, we'll use a simplified approach where ConnectionId contains the config
        // This should be replaced with proper storage/retrieval mechanism
        try
        {
            // Parse connection config from request (simplified - should come from storage)
            var connectionConfig = new ConnectionConfig
            {
                Id = request.ConnectionId,
                Server = request.ConnectionId // Simplified - should be retrieved from storage
            };

            var response = await _sqlConnectionService.ExecuteQueryAsync(connectionConfig, request.Query);
            var json = JsonSerializer.Serialize(response);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 200 
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ExecuteQuery failed with exception. ConnectionId: {ConnectionId}, Query length: {QueryLength}",
                request.ConnectionId, request.Query?.Length ?? 0);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = ex.Message
            };
            var json = JsonSerializer.Serialize(errorResponse);
            return new ContentResult 
            { 
                Content = json, 
                ContentType = "application/json",
                StatusCode = 200 
            };
        }
    }
}

