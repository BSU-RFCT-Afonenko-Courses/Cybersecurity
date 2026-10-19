-- Самодостаточный фасад ABI 1; канонический шаблон Performance.
local identity = {
  wrap_sync = function(_, fn) return fn end,
  wrap_walk = function(_, fn) return fn end,
  child_env = function(base) return base end,
}
return {
  create_metrics = function(extension_id, abi_version)
    local mode = os.getenv('COURSE_PERF_MODE')
    if not mode or mode == 'off' then return identity end
    local agent = rawget(_G, '__course_performance_agent_v1')
    if agent and agent.abiVersion == (abi_version or 1) then return agent.metrics end
    local failures = rawget(_G, '__course_performance_failures_v1') or {}
    _G.__course_performance_failures_v1 = failures
    failures[#failures+1] = extension_id .. ': агент ABI 1 отсутствует или несовместим'
    return identity
  end,
}
