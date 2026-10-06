-- Профили и course.view определяют публикуемое содержимое; этот модуль
-- задаёт способ его отображения после отбора.
local M = {}
local vocabulary = require("./vocabulary")
local function allowed(values, value) for _, item in ipairs(values) do if item == value then return true end end; return false end
local function string(value) return value and pandoc.utils.stringify(value) or nil end
function M.read(meta)
  local input = meta["course-presentation"]
  if input == nil then input = {} end
  if type(input) ~= "table" or input.t == "MetaList" or input.t == "MetaInlines" then
      assert(false, "course-presentation должен содержать YAML-словарь с параметром answers")
  end
  for key, _ in pairs(input) do
    if key ~= "answers" then
      assert(false, "Неизвестный параметр course-presentation: " .. tostring(key))
    end
  end
  local reveal = quarto.doc.is_format("revealjs")
  local html = reveal or quarto.doc.is_format("html")
  local answers = string(input.answers) or "auto"
  if not allowed(vocabulary.presentationAnswers, answers) then
    assert(false, "course-presentation.answers должен принимать значение auto или expanded")
  end
  local lang = string(meta.lang) or "ru"
  local pedagogy = meta["course-pedagogy"] or {}
  if type(pedagogy) ~= "table" then assert(false, "course-pedagogy должен содержать YAML-словарь параметров") end
  return {answers = answers, reveal = reveal, html = html,
    ru = lang:match("^ru") ~= nil,
    defaults = pedagogy["document-defaults"] == true and {
      difficulty = string(meta.difficulty), time = string(meta.time),
      ["work-mode"] = string(meta["work-mode"])
    } or {}}
end
return M
