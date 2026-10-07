-- Run with: quarto pandoc --lua-filter CI/native-run.lua --to plain
-- Exercise the installed writer with Windows path spellings and real files.
local scopes = {".", "theory", "task", "seminars"}
local cases = {
  {name="Windows backslashes", windows=true, suffix="\\_generated\\course-spec\\native-runs\\run-123"},
  {name="Windows mixed separators", windows=true, suffix="/_generated/course-spec\\native-runs/run-123"},
  {name="Windows forward slashes", windows=true, forward=true, suffix="/_generated/course-spec/native-runs/run-123"},
  {name="POSIX literal backslash", suffix="/_generated/course-spec/native-runs/run-123"},
  {name="Completed Windows run", windows=true, completed=true, suffix="\\_generated\\course-spec\\native-runs\\run-123"},
  {name="Other project root", windows=true, pointerRoot="D:\\Other", suffix="\\_generated\\course-spec\\native-runs\\run-123", error="NATIVE.RUN_POINTER_INVALID"},
  {name="Sibling project", windows=true, suffix="-other\\_generated\\course-spec\\native-runs\\run-123", error="NATIVE.RUN_DIRECTORY_INVALID"},
  {name="Forward traversal", windows=true, suffix="/_generated/course-spec/native-runs/../outside", error="NATIVE.RUN_DIRECTORY_INVALID"},
  {name="Backslash traversal", windows=true, suffix="\\_generated\\course-spec\\native-runs\\..\\outside", error="NATIVE.RUN_DIRECTORY_INVALID"},
  {name="Nested run", windows=true, suffix="\\_generated\\course-spec\\native-runs\\run-123\\nested", error="NATIVE.RUN_DIRECTORY_INVALID"},
  {name="Empty run ID", windows=true, suffix="\\_generated\\course-spec\\native-runs\\", error="NATIVE.RUN_DIRECTORY_INVALID"},
  {name="Invalid run ID", windows=true, suffix="\\_generated\\course-spec\\native-runs\\run.123", error="NATIVE.RUN_DIRECTORY_INVALID"},
}

local function read(path)
  local file = assert(io.open(path, "rb"))
  local value = file:read("*a")
  file:close()
  return value
end

local function write(path, value)
  local file = assert(io.open(path, "wb"))
  assert(file:write(value))
  file:close()
end

local count = 0
pandoc.system.with_temporary_directory("native-run-test", function(temp)
  for _,scope in ipairs(scopes) do
    for i,case in ipairs(cases) do
      local diskRoot = temp .. "/" .. scope:gsub("%.", "root") .. "-" .. i
      local root = case.windows and "D:\\Cybersecurity\\theory" or diskRoot .. "/project\\name"
      if case.forward then root = root:gsub("\\", "/") end
      local function map(path)
        if not case.windows then return path end
        local normalized = path:gsub("\\", "/")
        local prefix = "D:/Cybersecurity/theory/"
        assert(normalized:sub(1,#prefix)==prefix, "File access left the test project")
        return diskRoot .. "/" .. normalized:sub(#prefix+1)
      end
      local base = map(root .. "/_generated/course-spec")
      local runDirectory = base .. "/native-runs/run-123"
      pandoc.system.make_directory(runDirectory .. "/documents", true)
      write(base .. "/active-native-run.json", pandoc.json.encode({
        schema="course-native-run-pointer-v1", projectRoot=case.pointerRoot or root,
        directory=root .. case.suffix,
      }))
      if case.completed then write(runDirectory .. "/native-run.json", "{}") end

      local env = setmetatable({
        FORMAT="html",
        quarto={project={directory=root, profile={"student"}},
          doc={input_file="index.qmd", output_file="index.html"}},
        io={open=function(path, mode) return io.open(map(path), mode) end},
        pandoc=setmetatable({system=setmetatable({
          os=case.windows and "mingw32" or "linux",
          make_directory=function(path, recursive)
            return pandoc.system.make_directory(map(path), recursive)
          end,
        }, {__index=pandoc.system})}, {__index=pandoc}),
      }, {__index=_G})
      local extension = scope .. "/_extensions/Afonenko-Course-Tools/course-core"
      env.require = function(name)
        assert(name=="./diagnostics", "Unexpected module: " .. name)
        return assert(loadfile(extension .. "/diagnostics.lua", "t", env))()
      end
      local output = assert(loadfile(extension .. "/output.lua", "t", env))()
      local value = {course={view="student"}, resources={capturedFiles={
        {source="asset.png", sha1="resource-hash", _bytes="captured bytes"},
      }}}
      local ok, err = pcall(output.write, value)
      local label = scope .. ": " .. case.name
      if case.error then
        assert(not ok and tostring(err):find(case.error, 1, true), label .. ": " .. tostring(err))
      else
        assert(ok, label .. ": " .. tostring(err))
        local filename = pandoc.utils.sha1("index.qmd\0html") .. ".json"
        local document = read(base .. "/documents/student/" .. filename)
        local saved = pandoc.json.decode(document)
        assert(saved.source=="index.qmd", label .. ": wrong source")
        assert(read(map(saved.resources.capturedFiles[1].capture))=="captured bytes", label .. ": missing resource")
        if not case.completed then
          assert(read(runDirectory .. "/documents/" .. filename)==document, label .. ": missing run document")
        else
          assert(not io.open(runDirectory .. "/documents/" .. filename, "rb"), label .. ": reused completed run")
        end
      end
      count = count + 1
    end
  end
end)
io.stderr:write("PASS native-run paths and document writes: " .. count .. " cases\n")
return {}
