using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Serilog;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Services;
using SQLStressTest.Service.Utilities;
using SQLStressTest.Service.Validation;

// Ensure logs directory exists in project root
// Find project root by looking for masterun.ps1 or .git folder
var currentDir = Directory.GetCurrentDirectory();
var projectRoot = currentDir;
var maxDepth = 10;
for (int i = 0; i < maxDepth; i++)
{
    var masterScript = Path.Combine(projectRoot, "masterun.ps1");
    var gitFolder = Path.Combine(projectRoot, ".git");
    if (File.Exists(masterScript) || Directory.Exists(gitFolder))
    {
        break;
    }
    var parent = Directory.GetParent(projectRoot);
    if (parent == null) break;
    projectRoot = parent.FullName;
}

var logsDir = Path.Combine(projectRoot, "logs");
Directory.CreateDirectory(logsDir);

// Generate unique log file name with timestamp for each execution
// Format: backend-YYYYMMDD-HHMMSS.log (e.g., backend-20251111-162800.log)
var timestamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss");
var logFileName = $"backend-{timestamp}.log";
var logFilePath = Path.Combine(logsDir, logFileName);

// Clean up old log files (keep only last 50 execution logs)
try
{
    var oldLogFiles = Directory.GetFiles(logsDir, "backend-*.log")
        .OrderByDescending(f => File.GetCreationTime(f))
        .Skip(50)
        .ToList();
    
    foreach (var oldFile in oldLogFiles)
    {
        try
        {
            File.Delete(oldFile);
        }
        catch
        {
            // Ignore errors when deleting old log files
        }
    }
}
catch
{
    // Ignore errors during log cleanup
}

// Configure Serilog for file logging
// Each execution gets a fresh log file with timestamp
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File(
        logFilePath,
        rollingInterval: RollingInterval.Infinite, // Don't roll within the same file - each execution gets its own file
        fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB per file
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

// Log the log file path for reference
Log.Information("Logging to file: {LogFile}", logFilePath);

try
{
    Log.Information("Starting SQL Stress Test Service");

    var builder = WebApplication.CreateBuilder(args);
    
    // Use Serilog for logging
    builder.Host.UseSerilog();

// Add services to the container
// Configure API Explorer first to enable enhanced model metadata
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Configure JSON options for MVC controllers
        // With PublishTrimmed=true, .NET 9 disables reflection-based serialization by default
        // We must explicitly enable it via TypeInfoResolver for model binding to work
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver();
    })
    .ConfigureApiBehaviorOptions(options =>
    {
        // Suppress automatic model state validation to avoid "IsConvertibleType is not initialized" error
        // when trimming is enabled. Controllers will handle validation manually.
        // This is a known limitation in .NET 9 with PublishTrimmed=true and enhanced model metadata
        options.SuppressModelStateInvalidFilter = true;
    })
    .AddMvcOptions(options =>
    {
        // Disable validation during model binding to avoid "IsConvertibleType is not initialized" error
        // when trimming is enabled. We'll handle validation manually in controllers.
        // Replace the ObjectModelValidator with a no-op validator
        options.ModelValidatorProviders.Clear();
    });

// Replace IObjectModelValidator with a no-op implementation to prevent validation during model binding
// This avoids the "IsConvertibleType is not initialized" error when trimming is enabled
// Remove any existing registration first, then add our custom validator
builder.Services.RemoveAll<IObjectModelValidator>();
builder.Services.AddSingleton<IObjectModelValidator, NoOpObjectModelValidator>();

// Add SignalR with JSON protocol configured for strongly-typed DTOs
// NOTE: SignalR's SendAsync accepts params object[], which boxes strongly-typed DTOs as object.
// When SignalR's JsonHubProtocol.WriteArguments serializes these object[] arguments, it needs
// reflection to determine the actual type at runtime. With PublishTrimmed=true, .NET 9 disables
// reflection-based serialization by default, so we must explicitly enable it via TypeInfoResolver.
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
{
        // Configure JSON options for SignalR
        options.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.PayloadSerializerOptions.WriteIndented = false;
        
        // Explicitly enable reflection-based serialization for SignalR
        // This is required because SignalR's params object[] API requires runtime type resolution
        options.PayloadSerializerOptions.TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver();
    });

// CORS removed - not needed for local development

// Register services with dependency injection (SOLID principles)
builder.Services.AddSingleton<IConnectionStringBuilder, ConnectionStringBuilder>();
builder.Services.AddSingleton<ISqlConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<ISqlConnectionService, SqlConnectionService>(sp =>
{
    var connectionStringBuilder = sp.GetRequiredService<IConnectionStringBuilder>();
    var connectionFactory = sp.GetRequiredService<ISqlConnectionFactory>();
    var storageService = sp.GetService<IStorageService>();
    var logger = sp.GetService<ILogger<SqlConnectionService>>();
    return new SqlConnectionService(connectionStringBuilder, connectionFactory, storageService, logger);
});
builder.Services.AddSingleton<IPerformanceService, PerformanceService>(sp =>
{
    var logger = sp.GetRequiredService<ILogger<PerformanceService>>();
    var storageService = sp.GetService<IStorageService>();
    return new PerformanceService(logger, storageService);
});
builder.Services.AddScoped<IStressTestService, StressTestService>(sp =>
{
    var connectionStringBuilder = sp.GetRequiredService<IConnectionStringBuilder>();
    var connectionFactory = sp.GetRequiredService<ISqlConnectionFactory>();
    var hubContext = sp.GetRequiredService<IHubContext<SqlHub>>();
    var logger = sp.GetRequiredService<ILogger<StressTestService>>();
    var loggerFactory = sp.GetRequiredService<ILoggerFactory>();
    return new StressTestService(connectionStringBuilder, connectionFactory, hubContext, logger, loggerFactory);
});
builder.Services.AddSingleton<IStorageService, VSCodeStorageService>();
builder.Services.AddSingleton<VSCodeStorageService>(); // Also register as concrete type for hub injection

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Enable request buffering for body reading
app.Use(async (context, next) =>
{
    // Enable buffering for request body reading
    context.Request.EnableBuffering();
    await next();
});

// Add request logging middleware before CORS
app.Use(async (context, next) =>
{
    var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
    var origin = context.Request.Headers["Origin"].ToString();
    var referer = context.Request.Headers["Referer"].ToString();
    
    logger.LogInformation("Incoming request: {Method} {Path} | Origin: {Origin} | Referer: {Referer} | User-Agent: {UserAgent}",
        context.Request.Method,
        context.Request.Path,
        origin,
        referer,
        context.Request.Headers["User-Agent"].ToString());
    
    // Log all headers for debugging
    var headerStrings = context.Request.Headers.Select(h => $"{h.Key}: {string.Join(", ", h.Value.ToArray())}").ToArray();
    logger.LogDebug("Request headers: {Headers}", string.Join(", ", headerStrings));
    
    // Log request body for POST requests to SQL endpoints (sanitized)
    if (context.Request.Method == "POST" && 
        (context.Request.Path.StartsWithSegments("/api/sql/execute") || 
         context.Request.Path.StartsWithSegments("/api/sql/test")))
    {
        try
        {
            context.Request.Body.Position = 0;
            using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, leaveOpen: true);
            var body = await reader.ReadToEndAsync();
            context.Request.Body.Position = 0; // Reset position for controller to read
            
            // Sanitize body for logging (limit size, mask sensitive data)
            var sanitizedBody = body;
            if (body.Length > 1000)
            {
                sanitizedBody = body.Substring(0, 1000) + $"... (truncated, total length: {body.Length})";
            }
            
            // Try to parse as JSON and sanitize sensitive fields
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(body);
                var root = doc.RootElement;
                var sanitizedJson = new System.Text.StringBuilder();
                
                if (root.ValueKind == System.Text.Json.JsonValueKind.Object)
                {
                    sanitizedJson.Append("{");
                    var first = true;
                    foreach (var prop in root.EnumerateObject())
                    {
                        if (!first) sanitizedJson.Append(",");
                        first = false;
                        
                        sanitizedJson.Append($"\"{prop.Name}\":");
                        
                        // Mask sensitive fields
                        if (prop.Name.Equals("password", StringComparison.OrdinalIgnoreCase) ||
                            prop.Name.Equals("connectionString", StringComparison.OrdinalIgnoreCase))
                        {
                            sanitizedJson.Append("\"***MASKED***\"");
                        }
                        else
                        {
                            var valueStr = prop.Value.ToString();
                            if (valueStr.Length > 200)
                            {
                                sanitizedJson.Append($"\"{valueStr.Substring(0, 200)}...\"");
                            }
                            else
                            {
                                sanitizedJson.Append(prop.Value.ToString());
                            }
                        }
                    }
                    sanitizedJson.Append("}");
                    sanitizedBody = sanitizedJson.ToString();
                }
            }
            catch
            {
                // If JSON parsing fails, use the truncated string
            }
            
            logger.LogInformation("Request body for {Path}: {Body}", context.Request.Path, sanitizedBody);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to read request body for {Path}", context.Request.Path);
        }
    }
    
    await next();
    
    // Filter out noise: Don't log 404 for GET requests to root path (health checks, etc.)
    var shouldLogResponse = !(context.Request.Method == "GET" && 
                              context.Request.Path == "/" && 
                              context.Response.StatusCode == 404);
    
    if (shouldLogResponse)
    {
        logger.LogInformation("Response: {StatusCode} for {Method} {Path} | Origin: {Origin}",
            context.Response.StatusCode,
            context.Request.Method,
            context.Request.Path,
            origin);
    }
    
    // Log 400 and 403 specifically with full context
    if (context.Response.StatusCode == 400)
    {
        logger.LogWarning("400 Bad Request detected! Method: {Method}, Path: {Path}, Origin: {Origin}, Referer: {Referer}",
            context.Request.Method,
            context.Request.Path,
            origin,
            referer);
    }
    
    if (context.Response.StatusCode == 403)
    {
        var headerStrings403 = context.Request.Headers.Select(h => $"{h.Key}: {string.Join(", ", h.Value.ToArray())}").ToArray();
        logger.LogError("403 Forbidden detected! Method: {Method}, Path: {Path}, Origin: {Origin}, Referer: {Referer}, All Headers: {Headers}",
            context.Request.Method,
            context.Request.Path,
            origin,
            referer,
            string.Join(" | ", headerStrings403));
    }
});

app.UseRouting();

// Authorization removed - not needed for local development

app.MapControllers();

app.MapHub<SqlHub>("/sqlhub");

// Start performance data streaming
// Note: In Testing environment, streaming is started but may be slower for test stability
var performanceService = app.Services.GetRequiredService<IPerformanceService>();
var hubContext = app.Services.GetRequiredService<IHubContext<SqlHub>>();
_ = Task.Run(() => performanceService.StartStreamingAsync(hubContext));

app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
