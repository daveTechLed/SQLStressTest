using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Serilog;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Services;
using SQLStressTest.Service.Utilities;

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

// Configure Serilog for file logging
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File(
        Path.Combine(logsDir, "backend-.log"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 31,
        fileSizeLimitBytes: 10 * 1024 * 1024, // 10MB
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

try
{
    Log.Information("Starting SQL Stress Test Service");

    var builder = WebApplication.CreateBuilder(args);
    
    // Use Serilog for logging
    builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add SignalR
builder.Services.AddSignalR();

// Add CORS with detailed logging
// Note: CORS origin checks will be logged in middleware after CORS processing
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowVSCodeExtension", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
        {
            var isAllowed = false;
            
            // Allow null/empty origin (same-origin requests, file://, etc.)
            if (string.IsNullOrEmpty(origin))
            {
                isAllowed = true;
            }
            // Allow vscode-webview origins (any subdomain or path)
            else if (origin?.StartsWith("vscode-webview://", StringComparison.OrdinalIgnoreCase) == true)
            {
                isAllowed = true;
            }
            // Allow localhost origins (any port, any protocol)
            else if (origin?.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase) == true || 
                     origin?.StartsWith("https://localhost", StringComparison.OrdinalIgnoreCase) == true ||
                     origin?.StartsWith("http://127.0.0.1", StringComparison.OrdinalIgnoreCase) == true ||
                     origin?.StartsWith("https://127.0.0.1", StringComparison.OrdinalIgnoreCase) == true)
            {
                isAllowed = true;
            }
            // Allow file:// protocol (for local development)
            else if (origin?.StartsWith("file://", StringComparison.OrdinalIgnoreCase) == true)
            {
                isAllowed = true;
            }
            // In development or testing, be more permissive - allow any origin
            else if (builder.Environment.IsDevelopment() || 
                     builder.Environment.EnvironmentName == "Testing")
            {
                // Allow any origin in development/testing for easier debugging and testing
                isAllowed = true;
            }
            
            // Logging will happen in middleware - CORS policy can't easily access logger here
            return isAllowed;
        })
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
    });
});

// Register services with dependency injection (SOLID principles)
builder.Services.AddSingleton<IConnectionStringBuilder, ConnectionStringBuilder>();
builder.Services.AddSingleton<ISqlConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<ISqlConnectionService, SqlConnectionService>();
builder.Services.AddSingleton<IPerformanceService, PerformanceService>();

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
    
    // Log all headers for debugging (especially for CORS issues)
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
    
    // Log CORS-related headers specifically
    logger.LogDebug("CORS Headers - Origin: '{Origin}', Access-Control-Request-Method: '{Method}', Access-Control-Request-Headers: '{Headers}'",
        origin,
        context.Request.Headers["Access-Control-Request-Method"].ToString(),
        context.Request.Headers["Access-Control-Request-Headers"].ToString());
    
    // Determine if origin would be allowed (for logging purposes)
    var env = context.RequestServices.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
    var originAllowed = string.IsNullOrEmpty(origin) ||
                        origin?.StartsWith("vscode-webview://", StringComparison.OrdinalIgnoreCase) == true ||
                        origin?.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase) == true ||
                        origin?.StartsWith("https://localhost", StringComparison.OrdinalIgnoreCase) == true ||
                        origin?.StartsWith("http://127.0.0.1", StringComparison.OrdinalIgnoreCase) == true ||
                        origin?.StartsWith("https://127.0.0.1", StringComparison.OrdinalIgnoreCase) == true ||
                        origin?.StartsWith("file://", StringComparison.OrdinalIgnoreCase) == true ||
                        env.IsDevelopment(); // More permissive in development
    
    if (!string.IsNullOrEmpty(origin))
    {
        logger.LogInformation("CORS origin check: '{Origin}' -> {Allowed}", origin, originAllowed ? "ALLOWED" : "REJECTED");
        if (!originAllowed)
        {
            logger.LogWarning("CORS REJECTED: Origin '{Origin}' is not in allowed list", origin);
        }
    }
    
    await next();
    
    // Log CORS response headers
    var corsHeaders = new List<string>();
    if (context.Response.Headers.ContainsKey("Access-Control-Allow-Origin"))
    {
        corsHeaders.Add($"Access-Control-Allow-Origin: {context.Response.Headers["Access-Control-Allow-Origin"]}");
    }
    if (context.Response.Headers.ContainsKey("Access-Control-Allow-Credentials"))
    {
        corsHeaders.Add($"Access-Control-Allow-Credentials: {context.Response.Headers["Access-Control-Allow-Credentials"]}");
    }
    if (context.Response.Headers.ContainsKey("Access-Control-Allow-Methods"))
    {
        corsHeaders.Add($"Access-Control-Allow-Methods: {context.Response.Headers["Access-Control-Allow-Methods"]}");
    }
    if (corsHeaders.Any())
    {
        logger.LogInformation("CORS Response Headers: {Headers}", string.Join(", ", corsHeaders));
    }
    else if (!string.IsNullOrEmpty(origin))
    {
        logger.LogWarning("CORS Response Headers: NONE SET for origin '{Origin}' - This may indicate CORS rejection", origin);
    }
    
    logger.LogInformation("Response: {StatusCode} for {Method} {Path} | Origin: {Origin}",
        context.Response.StatusCode,
        context.Request.Method,
        context.Request.Path,
        origin);
    
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

app.UseCors("AllowVSCodeExtension");
app.UseRouting();
app.UseAuthorization();

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
