using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for stress test orchestrator.
/// </summary>
public interface IStressTestOrchestrator
{
    Task<IActionResult> ExecuteStressTestAsync(StressTestRequest? request, ModelStateDictionary? modelState = null);
}

