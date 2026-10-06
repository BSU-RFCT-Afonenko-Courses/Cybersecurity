/* Плагин Reveal. Файлы model.js и ui.js загружаются перед ним. */
(function (root) {
  'use strict';
  const cleanup = new Map();
  root.CourseNavigation = {
    id: 'CourseNavigation',
    init(deck) {
      const config = deck.getConfig();
      const configured = config.courseNav ?? config['course-nav'] ?? {};
      const printMode = config.view === 'print' || new URLSearchParams(location.search).has('print-pdf') || document.documentElement.classList.contains('print-pdf');
      // Подготовку содержимого к печати выполняют Quarto и course-presentation.
      if (printMode) return;
      if (configured === false) return;
      // Reveal удаляет скрытые разделы после инициализации плагина, до ready.
      // Координаты собираются после удаления, чтобы переходы были корректными.
      const start = () => {
        const options = Object.assign({ language: document.documentElement.lang?.startsWith('en') ? 'en' : 'ru', sidebar: true, title: document.querySelector('#title-slide h1')?.textContent.trim() || document.title }, configured);
        options.slideWidth = config.width; options.slideHeight = config.height;
        const { NavigationModel: Model, NavigationUI: UI } = root.CourseNavigationModules;
        const model = Model.collect(deck, UI.strings[options.language] || UI.strings.ru);
        const history = new Model.VisitHistory();
        let historyTarget = null;
        let ui;
        const current = () => model.slides.find(slide => slide.element === deck.getCurrentSlide());
        function goto(index) {
          const slide = model.slides[index];
          if (!slide) return;
          const indices = deck.getIndices(slide.element);
          deck.slide(indices.h, indices.v || 0, -1);
        }
        function update() {
          const slide = current();
          if (slide) {
            if (historyTarget !== slide.index) history.record(slide.index);
            historyTarget = null;
          }
          if (ui) ui.update(slide, history, deck.availableFragments());
        }
        function travel(direction) {
          const target = history.move(direction);
          if (target === null) return;
          historyTarget = target; goto(target);
          ui.update(current(), history, deck.availableFragments());
        }
        function section(direction) {
          const slide = current();
          const group = slide && model.groups[slide.group + direction];
          if (group) goto(group.start);
        }
        const actions = {
          goto, prev: () => deck.prev(), next: () => deck.next(),
          prevSection: () => section(-1), nextSection: () => section(1),
          back: () => travel(-1), forward: () => travel(1),
          print: () => {
            const url = new URL(location.href); url.searchParams.set('print-pdf', ''); url.hash = '';
            root.open(url.href, '_blank', 'noopener');
          },
          fullscreen: async () => {
            try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
            catch (_) { /* Внешний фрейм может запрещать полноэкранный режим. */ }
          }
        };
        document.body.classList.add('course-navigation-active');
        if (options.sidebar === false) document.body.classList.add('course-navigation-no-sidebar');
        ui = UI.build(model, options, actions);
        const overviewShown = () => { deck.toggleOverview(false); actions.overview(); };
        deck.on('overviewshown', overviewShown);
        if (!document.documentElement.requestFullscreen) ui.shell.querySelectorAll('[data-action="fullscreen"]').forEach(control => { control.hidden = true; });
        const changed = () => update();
        ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden'].forEach(event => deck.on(event, changed));
        const onResize = () => deck.layout();
        root.addEventListener('resize', onResize);
        const beforePrint = () => { document.body.classList.add('course-navigation-print'); deck.layout(); };
        const afterPrint = () => { document.body.classList.remove('course-navigation-print'); deck.layout(); };
        root.addEventListener('beforeprint', beforePrint); root.addEventListener('afterprint', afterPrint);
        update(); requestAnimationFrame(() => deck.layout());
        cleanup.set(deck, () => {
          ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden'].forEach(event => deck.off(event, changed));
          root.removeEventListener('resize', onResize); root.removeEventListener('beforeprint', beforePrint); root.removeEventListener('afterprint', afterPrint);
          deck.off('ready', start);
          deck.off('overviewshown', overviewShown);
          ui.destroy(); document.body.classList.remove('course-navigation-active', 'course-navigation-no-sidebar', 'course-navigation-print');
        });
      };
      if (deck.isReady()) start();
      else {
        deck.on('ready', start);
        cleanup.set(deck, () => deck.off('ready', start));
      }
    },
    destroy() { cleanup.forEach(dispose => dispose()); cleanup.clear(); }
  };
})(window);
