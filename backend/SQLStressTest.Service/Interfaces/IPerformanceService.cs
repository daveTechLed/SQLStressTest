using Microsoft.AspNetCore.SignalR;

namespace SQLStressTest.Service.Interfaces;

public interface IPerformanceService
{
    Task StartStreamingAsync(IHubContext<Hubs.SqlHub> hubContext);
    void StopStreaming();
}

