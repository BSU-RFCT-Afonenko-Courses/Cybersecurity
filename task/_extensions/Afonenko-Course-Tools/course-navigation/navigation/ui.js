/* Навигация курса: кнопки, диалоги и состояние презентации. */
(function (root) {
  'use strict';
  const namespace = root.CourseNavigationModules = root.CourseNavigationModules || {};
  const strings = {
    ru: { start: 'Начало', material: 'Материал', slide: 'Слайд', topics: 'Разделы', controls: 'Управление презентацией',
      prev: 'Предыдущий слайд', next: 'Следующий слайд', prevSection: 'Предыдущий раздел', nextSection: 'Следующий раздел',
      back: 'Назад по посещённым слайдам', forward: 'Вперёд по посещённым слайдам', overview: 'Обзор всех слайдов',
      search: 'Поиск по слайдам', fullscreen: 'Полный экран', print: 'Печать / PDF (новая вкладка)', close: 'Закрыть', searchPlaceholder: 'Заголовок, термин или фрагмент кода…',
      noResults: 'Ничего не найдено', searchHint: 'Поиск выполняется только в этой презентации.', sectionProgress: 'В разделе',
      allProgress: 'Прогресс презентации', section: 'Раздел', resultCount: 'Найдено слайдов', presentation: 'Презентация' },
    en: { start: 'Start', material: 'Content', slide: 'Slide', topics: 'Sections', controls: 'Presentation controls',
      prev: 'Previous slide', next: 'Next slide', prevSection: 'Previous section', nextSection: 'Next section',
      back: 'Back in visited slides', forward: 'Forward in visited slides', overview: 'Slide overview',
      search: 'Search slides', fullscreen: 'Full screen', print: 'Print / PDF (new tab)', close: 'Close', searchPlaceholder: 'Heading, term, or code…',
      noResults: 'No slides found', searchHint: 'Search only this presentation.', sectionProgress: 'In section',
      allProgress: 'Presentation progress', section: 'Section', resultCount: 'Slides found', presentation: 'Presentation' }
  };
  const paths = {
    prev: 'm14 6-6 6 6 6', next: 'm10 6 6 6-6 6',
    prevSection: 'M5 5v14m14-13-8 6 8 6', nextSection: 'M19 5v14M5 6l8 6-8 6',
    back: 'M5 8h10a6 6 0 0 1 0 12M5 8l5-5M5 8l5 5',
    forward: 'M19 8H9a6 6 0 0 0 0 12M19 8l-5-5m5 5-5 5',
    overview: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
    search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    fullscreen: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    print: 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h.01',
    topics: 'M4 6h16M4 12h16M4 18h16', close: 'm6 6 12 12M18 6 6 18'
  };
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(action, label, callback, caption) {
    const control = el('button', 'course-nav-button' + (caption ? ' course-nav-caption-button' : ''));
    control.type = 'button'; control.title = label; control.setAttribute('aria-label', label); control.dataset.action = action;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[action]); svg.append(path); control.append(svg);
    if (caption) control.append(el('span', '', label));
    control.addEventListener('click', callback);
    return control;
  }
  function dialog(label) {
    const node = el('dialog', 'course-nav-dialog');
    node.setAttribute('aria-label', label);
    node.addEventListener('click', event => { if (event.target === node) { const r = node.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) node.close(); } });
    node.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); node.close(); }
    });
    return node;
  }
  function build(model, options, actions) {
    const labels = strings[options.language] || strings.ru;
    const shell = el('div', 'course-nav-shell');
    const sidebar = el('aside', 'course-nav-sidebar');
    sidebar.setAttribute('aria-label', labels.topics);
    sidebar.append(el('div', 'course-nav-course-title', options.title || labels.presentation));
    sidebar.append(el('div', 'course-nav-eyebrow', labels.topics));
    const lists = [];
    function sectionList() {
      const list = el('ol', 'course-nav-topics');
      model.groups.forEach(group => {
        const li = el('li');
        const control = el('button', 'course-nav-topic');
        control.type = 'button'; control.title = group.title;
        control.append(el('span', 'course-nav-topic-number', String(group.index + 1).padStart(2, '0')));
        control.append(el('span', 'course-nav-topic-name', group.title));
        control.addEventListener('click', () => { closeDialogs(); actions.goto(group.start); });
        li.append(control); list.append(li);
      });
      lists.push(list); return list;
    }
    sidebar.append(sectionList());
    const footer = el('footer', 'course-nav-footer');
    const status = el('div', 'course-nav-status');
    const counter = el('div', 'course-nav-counter'); counter.setAttribute('aria-live', 'polite'); counter.setAttribute('aria-atomic', 'true');
    const progress = el('progress', 'course-nav-progress'); progress.setAttribute('aria-label', labels.allProgress);
    status.append(counter, progress);
    const sectionStatus = el('div', 'course-nav-section-status');
    const sectionTitle = el('div', 'course-nav-section-title');
    const sectionCount = el('span', 'course-nav-section-count');
    sectionStatus.append(sectionTitle, sectionCount);
    const controls = el('nav', 'course-nav-controls'); controls.setAttribute('aria-label', labels.controls);
    const buttons = {};
    function addControl(parent, key, extraClass, caption = false, activate = () => actions[key]()) {
      const control = button(key, labels[key], activate, caption);
      if (extraClass) control.classList.add(extraClass);
      parent.append(control); (buttons[key] = buttons[key] || []).push(control); return control;
    }
    const menu = dialog(labels.topics);
    const menuHeader = el('div', 'course-nav-dialog-header'); menuHeader.append(el('h2', '', labels.topics), button('close', labels.close, () => menu.close())); menu.append(menuHeader);
    const menuActions = el('div', 'course-nav-menu-actions');
    // После перехода меню закрывается, в том числе на узком экране.
    ['prevSection', 'nextSection', 'back', 'forward'].forEach(key =>
      addControl(menuActions, key, '', true, () => { closeDialogs(); actions[key](); }));
    menu.append(menuActions, sectionList());
    actions.topics = () => menu.showModal();
    addControl(controls, 'topics', 'course-nav-menu-toggle');
    ['back', 'forward', 'prevSection', 'nextSection'].forEach(key => addControl(controls, key, 'course-nav-auxiliary'));
    ['prev', 'next', 'overview', 'search', 'fullscreen', 'print'].forEach(key => addControl(controls, key));
    footer.append(status, sectionStatus, controls);
    // Обзор в порядке документа, независимый от пространственных групп Reveal.
    const overview = dialog(labels.overview); overview.classList.add('course-nav-overview');
    const overviewHeader = el('div', 'course-nav-dialog-header');
    const overviewClose = button('close', labels.close, () => overview.close());
    overviewHeader.append(el('h2', '', labels.overview), overviewClose);
    const grid = el('ol', 'course-nav-overview-grid'); overview.append(overviewHeader, grid);
    const cards = [];
    const previewWidth = Number(options.slideWidth) || 1280;
    const previewHeight = Number(options.slideHeight) || 720;
    const previewObserver = new ResizeObserver(entries => entries.forEach(entry => {
      entry.target.firstElementChild.style.transform = `scale(${entry.contentRect.width / previewWidth})`;
    }));
    function makePreview(slide) {
      const viewport = el('div', 'course-nav-preview'); viewport.setAttribute('aria-hidden', 'true'); viewport.inert = true;
      viewport.style.aspectRatio = `${previewWidth} / ${previewHeight}`;
      const canvas = el('div', 'reveal course-nav-preview-canvas');
      canvas.style.width = `${previewWidth}px`; canvas.style.height = `${previewHeight}px`;
      const slides = el('div', 'slides'); const clone = slide.element.cloneNode(true);
      clone.removeAttribute('style'); clone.removeAttribute('hidden'); clone.removeAttribute('aria-hidden');
      clone.classList.remove('past', 'future'); clone.classList.add('present');
      if (slide.isTitle) clone.classList.add('course-nav-preview-title');
      clone.querySelectorAll('aside.notes,.speaker-notes,script,style,iframe,object,embed,audio,video,.code-copy-button').forEach(node => node.remove());
      // Сохраняем ссылки внутри SVG, не дублируя ID документа.
      const ids = new Map();
      [clone, ...clone.querySelectorAll('[id]')].forEach(node => { if (node.id) { ids.set(node.id, `course-preview-${slide.index}-${node.id}`); node.id = ids.get(node.id); } });
      [clone, ...clone.querySelectorAll('*')].forEach(node => {
        [...node.attributes].forEach(attribute => {
          if (/^on/i.test(attribute.name) || /^(autofocus|autoplay|name)$/.test(attribute.name)) node.removeAttribute(attribute.name);
          else {
            let value = attribute.value.replace(/url\(#([^)]*)\)/g, (match, id) => ids.has(id) ? `url(#${ids.get(id)})` : match);
            if (/^(href|xlink:href)$/.test(attribute.name) && value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
            if (value !== attribute.value) node.setAttribute(attribute.name, value);
          }
        });
      });
      clone.querySelectorAll('img[data-src]').forEach(node => { node.src = node.dataset.src; });
      clone.querySelectorAll('.fragment').forEach(node => node.classList.add('visible'));
      slides.append(clone); canvas.append(slides); viewport.append(canvas); previewObserver.observe(viewport);
      return viewport;
    }
    let currentIndex = -1;
    actions.overview = () => {
      closeDialogs();
      if (!cards.length) model.slides.forEach(slide => {
        const item = el('li', 'course-nav-overview-card');
        const control = el('button', 'course-nav-overview-jump'); control.type = 'button'; control.dataset.slide = slide.index;
        control.setAttribute('aria-label', `${labels.slide} ${slide.index + 1}: ${slide.title}`);
        const caption = el('span', 'course-nav-overview-caption');
        caption.append(el('span', 'course-nav-overview-meta', `${String(slide.index + 1).padStart(2, '0')} / ${model.slides.length} · ${model.groups[slide.group].title}`), el('span', 'course-nav-overview-title', slide.title));
        control.append(caption); control.addEventListener('click', () => { overview.close(); actions.goto(slide.index); });
        item.append(makePreview(slide), control); grid.append(item); cards.push(control);
      });
      cards.forEach((control, i) => { if (i === currentIndex) control.setAttribute('aria-current', 'step'); else control.removeAttribute('aria-current'); });
      overview.showModal(); overviewClose.focus({preventScroll:true}); overview.scrollTop = 0;
    };
    const search = dialog(labels.search);
    const searchHeader = el('div', 'course-nav-dialog-header'); searchHeader.append(el('h2', '', labels.search), button('close', labels.close, () => search.close()));
    const input = el('input', 'course-nav-search-input'); input.type = 'search'; input.placeholder = labels.searchPlaceholder; input.setAttribute('aria-label', labels.search); input.autocomplete = 'off';
    const hint = el('p', 'course-nav-search-hint', labels.searchHint);
    const resultCount = el('p', 'course-nav-result-count'); resultCount.setAttribute('aria-live', 'polite');
    const results = el('ol', 'course-nav-search-results');
    const updateResults = () => {
      const term = input.value.trim().toLocaleLowerCase();
      const matches = model.slides.filter(slide => !term || slide.search.includes(term));
      results.replaceChildren(); resultCount.textContent = matches.length ? `${labels.resultCount}: ${matches.length}` : labels.noResults;
      matches.forEach(slide => {
        const li = el('li'); const control = el('button', 'course-nav-result'); control.type = 'button';
        control.append(el('span', 'course-nav-result-number', String(slide.index + 1)), el('span', '', slide.title));
        const target = namespace.NavigationModel.findTarget(slide, term);
        control.addEventListener('click', () => { search.close(); actions.goto(slide.index, target); }); li.append(control); results.append(li);
      });
    };
    input.addEventListener('input', updateResults);
    search.append(searchHeader, input, hint, resultCount, results);
    actions.search = () => { updateResults(); search.showModal(); input.focus(); };
    function closeDialogs() { if (menu.open) menu.close(); if (search.open) search.close(); if (overview.open) overview.close(); }
    shell.append(sidebar, footer, menu, search, overview);
    if (options.sidebar === false) shell.classList.add('course-nav-no-sidebar');
    document.body.append(shell);
    function update(current, history, fragmentState) {
      const total = model.slides.length;
      const index = current ? current.index : -1;
      currentIndex = index;
      counter.textContent = `${labels.slide} ${index + 1} / ${total}`;
      progress.max = Math.max(total, 1); progress.value = index + 1;
      const group = current ? model.groups[current.group] : null;
      sectionTitle.textContent = group ? group.title : labels.material;
      sectionCount.textContent = group ? `${labels.sectionProgress}: ${index - group.start + 1} / ${group.slides.length}` : '';
      sectionStatus.setAttribute('aria-label', group ? `${labels.section}: ${group.title}. ${sectionCount.textContent}` : labels.material);
      lists.forEach(list => Array.from(list.children).forEach((li, i) => {
        const control = li.firstElementChild;
        if (group && i === group.index) control.setAttribute('aria-current', 'step'); else control.removeAttribute('aria-current');
        control.classList.toggle('course-nav-topic-complete', !!group && i < group.index);
      }));
      const disabled = {
        prev: index <= 0 && !fragmentState.prev, next: index >= total - 1 && !fragmentState.next,
        prevSection: !group || group.index === 0, nextSection: !group || group.index === model.groups.length - 1,
        back: !history.canMove(-1), forward: !history.canMove(1), overview: total === 0, search: total === 0
      };
      Object.entries(disabled).forEach(([key, value]) => (buttons[key] || []).forEach(control => { control.disabled = value; }));
    }
    return { shell, update, closeDialogs, destroy: () => { previewObserver.disconnect(); shell.remove(); } };
  }
  namespace.NavigationUI = { build, strings };
})(window);
