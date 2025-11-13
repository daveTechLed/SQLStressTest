using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for validating query and stress test requests.
/// Single Responsibility: Request validation only.
/// </summary>
public class QueryRequestValidator : IQueryRequestValidator
{
    private readonly ILogger<QueryRequestValidator>? _logger;

    public QueryRequestValidator(ILogger<QueryRequestValidator>? logger = null)
    {
        _logger = logger;
    }

    /// <summary>
    /// Validates a QueryRequest and returns validation errors if any.
    /// </summary>
    public ValidationResult ValidateQueryRequest(QueryRequest? request, Microsoft.AspNetCore.Mvc.ModelBinding.ModelStateDictionary? modelState = null)
    {
        if (request == null)
        {
            _logger?.LogWarning("QueryRequest validation failed: Request is null");
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Request is required"
            };
        }

        // Check model state if provided
        if (modelState != null && !modelState.IsValid)
        {
            var modelErrors = string.Join(", ", modelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage ?? "Unknown error"));

            var errorDetails = modelState
                .Where(ms => ms.Value?.Errors?.Any() == true)
                .Select(ms => $"{ms.Key}: {string.Join(", ", ms.Value!.Errors!.Select(e => e.ErrorMessage ?? "Unknown error"))}")
                .ToList();

            _logger?.LogWarning("QueryRequest model validation failed. Errors: {Errors}, Error details: {ErrorDetails}",
                modelErrors, string.Join("; ", errorDetails));

            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = $"Validation failed: {modelErrors}"
            };
        }

        // Validate ConnectionId
        if (string.IsNullOrWhiteSpace(request.ConnectionId))
        {
            var queryPreview = request.Query?.Length > 100
                ? request.Query.Substring(0, 100) + "..."
                : request.Query;
            _logger?.LogWarning("QueryRequest validation failed: ConnectionId is null or empty. Query length: {QueryLength}, Query preview: {QueryPreview}",
                request.Query?.Length ?? 0, queryPreview);

            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "ConnectionId is required"
            };
        }

        // Validate Query
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            _logger?.LogWarning("QueryRequest validation failed: Query is null or empty. ConnectionId: {ConnectionId}",
                request.ConnectionId);

            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Query is required"
            };
        }

        // Log request details for debugging (sanitized - don't log full query if it's very long)
        var queryPreviewForLogging = request.Query.Length > 100
            ? request.Query.Substring(0, 100) + "..."
            : request.Query;

        _logger?.LogDebug("QueryRequest validation successful. ConnectionId: {ConnectionId}, Query length: {QueryLength}, Query preview: {QueryPreview}",
            request.ConnectionId, request.Query.Length, queryPreviewForLogging);

        return new ValidationResult
        {
            IsValid = true
        };
    }

    /// <summary>
    /// Validates a StressTestRequest and returns validation errors if any.
    /// </summary>
    public ValidationResult ValidateStressTestRequest(StressTestRequest? request, Microsoft.AspNetCore.Mvc.ModelBinding.ModelStateDictionary? modelState = null)
    {
        if (request == null)
        {
            _logger?.LogWarning("StressTestRequest validation failed: Request is null");
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Request is required"
            };
        }

        // Check model state if provided
        if (modelState != null && !modelState.IsValid)
        {
            var modelErrors = string.Join(", ", modelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage ?? "Unknown error"));

            _logger?.LogWarning("StressTestRequest model validation failed. Errors: {Errors}", modelErrors);

            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = $"Validation failed: {modelErrors}"
            };
        }

        // Validate ConnectionId
        if (string.IsNullOrWhiteSpace(request.ConnectionId))
        {
            _logger?.LogWarning("StressTestRequest validation failed: ConnectionId is null or empty");
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "ConnectionId is required"
            };
        }

        // Validate Query
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            _logger?.LogWarning("StressTestRequest validation failed: Query is null or empty");
            return new ValidationResult
            {
                IsValid = false,
                ErrorMessage = "Query is required"
            };
        }

        _logger?.LogInformation("StressTestRequest validation successful. ConnectionId: {ConnectionId}, ParallelExecutions: {ParallelExecutions}, TotalExecutions: {TotalExecutions}",
            request.ConnectionId, request.ParallelExecutions, request.TotalExecutions);

        return new ValidationResult
        {
            IsValid = true
        };
    }
}

/// <summary>
/// Result of request validation.
/// </summary>
public class ValidationResult
{
    public bool IsValid { get; set; }
    public string? ErrorMessage { get; set; }
}

