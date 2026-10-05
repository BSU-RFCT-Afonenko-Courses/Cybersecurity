/** Выбранные профили явно передаются каждой сборке подпроекта. */
export function activeProfiles(value = Deno.env.get("QUARTO_PROFILE") ?? ""): string[] {
  const result = value.split(",").map((name) => name.trim()).filter(Boolean);
  if (result.some((name) => !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name))) throw new Error("Публикация некорректное имя активного профиля");
  if (new Set(result).size !== result.length) throw new Error("Публикация повторяющийся активный профиль");
  return result;
}
export function profileArguments(profiles: string[]): string[] {
  return profiles.length ? ["--profile", profiles.join(",")] : [];
}
