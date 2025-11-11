using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace SQLStressTest.Service.Hubs;

public class SqlHub : Hub
{
    private readonly ILogger<SqlHub> _logger;

    public SqlHub(ILogger<SqlHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connecting to SqlHub. ConnectionId: {ConnectionId}, User: {User}, Context: {Context}", 
            Context.ConnectionId, 
            Context.User?.Identity?.Name ?? "Anonymous",
            Context.GetHttpContext()?.Request?.Headers?.ToString() ?? "No context");

        try
        {
            await base.OnConnectedAsync();
            
            var heartbeat = new
            {
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                status = "connected"
            };
            
            _logger.LogInformation("Sending initial heartbeat to connection {ConnectionId}. Timestamp: {Timestamp}", 
                Context.ConnectionId, 
                heartbeat.timestamp);
            
            await Clients.Caller.SendAsync("Heartbeat", heartbeat);
            
            _logger.LogInformation("Client connected successfully. ConnectionId: {ConnectionId}", Context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnConnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnecting from SqlHub. ConnectionId: {ConnectionId}", Context.ConnectionId);
        
        if (exception != null)
        {
            _logger.LogError(exception, "Client disconnected with error. ConnectionId: {ConnectionId}, Error: {ErrorMessage}", 
                Context.ConnectionId, 
                exception.Message);
        }
        
        try
        {
            await base.OnDisconnectedAsync(exception);
            _logger.LogInformation("Client disconnected successfully. ConnectionId: {ConnectionId}", Context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnDisconnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }
}

