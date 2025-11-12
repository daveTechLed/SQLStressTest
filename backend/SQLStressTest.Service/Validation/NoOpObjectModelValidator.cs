using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;

namespace SQLStressTest.Service.Validation;

/// <summary>
/// No-op implementation of IObjectModelValidator that skips validation entirely.
/// This is used to avoid "IsConvertibleType is not initialized" errors when trimming is enabled.
/// Controllers will handle validation manually.
/// </summary>
public class NoOpObjectModelValidator : IObjectModelValidator
{
    public void Validate(
        ActionContext actionContext,
        ValidationStateDictionary? validationState,
        string prefix,
        object? model)
    {
        // No-op: Skip validation entirely to avoid model metadata errors when trimming is enabled
        // Controllers will handle validation manually
    }
}

