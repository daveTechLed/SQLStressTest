# ❌ CRITICAL: Build Failures

**1 test project(s) failed to build.** These must be fixed before test coverage analysis can proceed.

## SQLStressTest.Service.Tests

**Path:** `/Users/dave/repos/SQLStressTest/backend/SQLStressTest.Service.UnitTests/SQLStressTest.Service.Tests.csproj`

### Build Errors

```
ModuleTracker type not found (with HitsArray field) in instrumented assemblies. Test assembly: /Users/dave/repos/SQLStressTest/backend/SQLStressTest.Service.UnitTests/.test-build/SQLStressTest.Service.Tests.dll. ModuleTracker is injected into ALL assemblies built with /p:CollectCoverage=true by coverlet.msbuild. This includes the test assembly itself (if built with instrumentation) AND production assemblies. Ensure both the test assembly and production assemblies are built with MSBuild instrumentation (/p:CollectCoverage=true). The test assembly should have ModuleTracker if it was built with instrumentation.
```

