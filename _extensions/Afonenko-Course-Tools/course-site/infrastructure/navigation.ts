import { createMetrics } from "../observability/bridge.ts";
const metrics = createMetrics("course-site");
import { dirname, relative, within } from "./files.ts";

/** Адреса берутся только из текущих native HTML, без второй карты курса. */
export async function addressNavigation(
  stage: string,
  outputs: string[],
  composition = false,
  courseUrl?: string,
): Promise<void> {
  const html = new Map<string, string>();
  for (const output of outputs) {
    within(stage, output);
    if (output.endsWith(".html")) html.set(output, await Deno.readTextFile(output));
  }
  const presentations = [...html].filter(([, text]) =>
    /<div\b[^>]*\bclass="[^"]*\breveal\b/.test(text) && /Reveal\.initialize\s*\(/.test(text)
  ).map(([path]) => path);
  for (const [output, source] of html) {
    let text = source;
    if (composition) {
      // Это payload собственного фильтра Navigation, не чужие metadata/QRC.
      text = text.replace(
        /(<script id="course-navigation-context" type="application\/json">)([\s\S]*?)(<\/script>)/,
        (_match, start, payload, end) => {
          const context = JSON.parse(payload);
          for (const link of context.links) {
            if (link.scope === "course") {
              link.href = relative(dirname(output), within(stage, link.path))
                .replaceAll("\\", "/");
            }
          }
          return start + JSON.stringify(context).replaceAll("<", "\\u003c") + end;
        },
      );
    }
    // Только штатные страницы index.html получают правило входа в презентации.
    const index = /(^|[\\/])index\.html$/.test(output) &&
      !presentations.includes(output);
    if (index || composition && courseUrl) {
      const targets = (index ? presentations : []).map((path) =>
        relative(dirname(output), path).replaceAll("\\", "/")
      );
      const rootHref = (relative(dirname(output), stage).replaceAll("\\", "/") || ".") + "/";
      const base = composition && courseUrl
        ? JSON.stringify({ courseUrl, rootHref }).replaceAll("<", "\\u003c")
        : "null";
      const script = `<script id="course-site-navigation">(function(){
const base=${base};
if(base){
 const course=new URL(base.courseUrl); course.pathname=course.pathname.replace(/\\/$/,'')+'/';
 const root=new URL(base.rootHref,document.baseURI);
 for(const link of document.querySelectorAll('#quarto-header a[href],#quarto-sidebar a[href],.quarto-navbar a[href],.quarto-sidebar a[href]')){
  const url=new URL(link.href,document.baseURI);
  if(url.origin===course.origin&&url.pathname.startsWith(course.pathname)){
   let path=url.pathname.slice(course.pathname.length); if(!path||path.endsWith('/')) path+='index.html';
   link.href=new URL(path+url.search+url.hash,root).href;
  }
 }
}
const targets=${JSON.stringify(targets).replaceAll("<", "\\u003c")}.map(path=>new URL(path,document.baseURI));
for(const link of document.querySelectorAll('a[href]')){
 const url=new URL(link.href,document.baseURI);
 if(targets.some(target=>target.origin===url.origin&&(
  target.pathname===url.pathname || target.pathname.endsWith('/index.html')&&target.pathname.slice(0,-'index.html'.length)===url.pathname
 ))){
  link.target='_blank'; link.rel=[...new Set([...link.rel.split(/\\s+/).filter(Boolean),'noopener','noreferrer'])].join(' ');
 }
}
})();</script>`;
      text = text.replace(/<script id="course-site-navigation">[\s\S]*?<\/script>\s*/g, "");
      text = text.replace(/<\/body>/i, script + "\n</body>");
    }
    if (text !== source) await Deno.writeTextFile(output, text);
  }
}

// @ts-expect-error JS допускает замену function binding; публичная сигнатура сохраняется.
addressNavigation = metrics.wrapAsync({id:"course-site.infrastructure.navigation.addressNavigation",kind:"phase"},addressNavigation);
