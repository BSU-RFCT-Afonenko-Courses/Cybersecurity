// Опубликованные цели сохраняют штатные ID Quarto. Обработчик раскрывает
// существующее представление документа, не вводя учебных ролей и новых ID.
(() => {
  if (new URL(location.href).searchParams.has("print-pdf")) return;
  let navigation = 0;

  function hashId(url) {
    try { return decodeURIComponent(url.hash.replace(/^#\/?/, "")); }
    catch { return ""; } // Некорректный фрагмент внешней ссылки не должен нарушать работу страницы.
  }

  function ancestors(target) {
    const nodes = [];
    for (let node = target; node; node = node.parentElement) nodes.push(node);
    return nodes.reverse();
  }

  function openDisclosures(nodes, scroll) {
    for (const node of nodes) {
      if (node.matches("details")) node.open = true;
      if (!node.matches(".collapse:not(.show)")) continue;

      // Bootstrap управляет анимацией и состоянием переключателя.
      // В темах без Bootstrap блок раскрывается напрямую; details работает штатно.
      const Collapse = window.bootstrap?.Collapse;
      if (Collapse) {
        node.addEventListener("shown.bs.collapse", scroll, { once: true });
        Collapse.getOrCreateInstance(node, { toggle: false }).show();
      } else {
        node.classList.add("show");
        if (!node.id) continue;
        for (const trigger of document.querySelectorAll("[aria-controls]")) {
          if (!trigger.getAttribute("aria-controls").split(/\s+/).includes(node.id)) continue;
          trigger.setAttribute("aria-expanded", "true");
          trigger.classList.remove("collapsed");
        }
      }
    }
  }

  function revealTarget(id) {
    const target = id && document.getElementById(id);
    if (!target) return;
    const current = ++navigation;
    const scroll = () => requestAnimationFrame(() => {
      // Завершение анимации не должно возвращать прокрутку после нового перехода.
      if (current === navigation) target.scrollIntoView({ block: "nearest" });
    });
    const nodes = ancestors(target);
    const section = target.closest("section.slide");
    const reveal = window.Reveal;
    if (section && target !== section && reveal?.isReady()) {
      const position = reveal.getIndices(section);
      reveal.slide(position.h, position.v);
      // У вложенных фрагментов могут различаться индексы. Показываем
      // все фрагменты вокруг цели; нулевой индекс также допустим.
      const indices = nodes.filter(node => node.matches(".fragment[data-fragment-index]"))
        .map(node => Number(node.getAttribute("data-fragment-index")))
        .filter(Number.isFinite);
      if (indices.length) reveal.navigateFragment(Math.max(...indices));
    }
    openDisclosures(nodes, scroll);
    scroll();
  }

  function initialTarget() {
    const url = new URL(location.href);
    revealTarget(url.searchParams.get("qrc-target") || hashId(url));
  }

  function ready() {
    if (window.Reveal && !window.Reveal.isReady()) window.Reveal.on("ready", initialTarget);
    else initialTarget();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();

  // qrc-target обрабатывается только при входе на страницу. Повторное применение
  // при смене фрагмента URL возвращало бы преподавателя к цели после перехода вперёд.
  window.addEventListener("hashchange", () => revealTarget(hashId(new URL(location.href))));
  document.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    // Повторный переход по тому же фрагменту URL не вызывает hashchange.
    // Раскрываем цель после штатной навигации и обработчика Revealjs.
    queueMicrotask(() => revealTarget(hashId(url)));
  }, true);
})();
