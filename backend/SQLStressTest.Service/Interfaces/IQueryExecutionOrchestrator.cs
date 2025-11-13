using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for query execution orchestrator.
/// </summary>
public interface IQueryExecutionOrchestrator
{
    Task<IActionResult> ExecuteQueryAsync(QueryRequest? request, ModelStateDictionary? modelState = null);
}

