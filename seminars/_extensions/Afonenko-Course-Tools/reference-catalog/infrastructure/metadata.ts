// Только подтверждённые группы metadata: значения и остальные атрибуты сохраняются.
// Pandoc Attr из Lua tables не задаёт порядок этих атрибутов между процессами.
export function canonicalizeMetadata(contents: string, sourceRoot?: string): string {
  return contents.replace(
    /<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<(?:a|div)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi,
    (chunk) => {
      const prefix = chunk.match(/^<(a|div)\b/i);
      if (!prefix) return chunk;
      const start = prefix[0].length;
      const body = chunk.slice(start, -1);
      const attrs = [...body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)];
      // Не переписывать malformed HTML и duplicate attrs (их первый value значим).
      if (body.replace(/([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g, "").trim()) {
        return chunk;
      }
      const names = attrs.map((a) => a[1].toLowerCase());
      if (new Set(names).size !== names.length) return chunk;
      const value = (name: string) => {
        const attr = attrs.find((a) => a[1].toLowerCase() === name);
        return attr?.[0].match(/=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))$/)?.slice(1).find((v) =>
          v !== undefined
        );
      };
      const classes = (value("class") ?? "").split(/\s+/);
      let allowed: string[] = [];
      if (prefix[1].toLowerCase() === "a") {
        allowed = ["data-qrc-ref", "data-qrc-custom", "data-qrc-style", "data-qrc-deferred"];
      } else if (classes.includes("qrc-probe")) {
        allowed = ["data-qrc-id", "data-qrc-style", "data-qrc-title"];
      } else if (classes.includes("qrc-probes")) {
        allowed = ["data-qrc-source", "data-qrc-namespace", "hidden", "aria-hidden"];
      }
      const selected = attrs.filter((a) => allowed.includes(a[1].toLowerCase()));
      const ordered = [...selected].sort((a, b) => a[1].localeCompare(b[1]));
      const source = value("data-qrc-source");
      const root = sourceRoot?.replace(/\/$/, "");
      const relativeSource = root && source?.startsWith(root + "/")
        ? source.slice(root.length + 1)
        : undefined;
      let result = chunk.slice(0, start), cursor = 0, index = 0;
      for (const attr of selected) {
        const next = ordered[index++];
        let text = next[0];
        if (
          classes.includes("qrc-probes") && next[1] === "data-qrc-source" &&
          relativeSource && !relativeSource.split("/").includes("..")
        ) text = text.replace(source!, "$SOURCE_ROOT/" + relativeSource);
        result += body.slice(cursor, attr.index) + text;
        cursor = attr.index! + attr[0].length;
      }
      return result + body.slice(cursor) + ">";
    },
  );
}
