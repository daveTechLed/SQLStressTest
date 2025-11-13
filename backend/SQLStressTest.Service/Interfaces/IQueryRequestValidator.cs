using Microsoft.AspNetCore.Mvc.ModelBinding;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for query request validator.
/// </summary>
public interface IQueryRequestValidator
{
    ValidationResult ValidateQueryRequest(QueryRequest? request, ModelStateDictionary? modelState = null);
    ValidationResult ValidateStressTestRequest(StressTestRequest? request, ModelStateDictionary? modelState = null);
}

