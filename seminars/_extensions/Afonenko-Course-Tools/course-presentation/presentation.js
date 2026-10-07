/* Подготовка к печати не зависит от навигации Reveal и темы.
 * Раскрывается только содержимое DOM, оставшееся после отбора по профилю;
 * исключённые ядром материалы преподавателя не восстанавливаются. */
(() => {
  'use strict';
  let openedForPrint = [];
  let expandedForPrint = [];
  const parameters = new URLSearchParams(window.location.search);
  const printPdf = parameters.has('print-pdf');
  let mode = parameters.get('course-mode') === 'lecture' ? 'lecture' : 'study';
  let reveal, modeButton, notesBeforePrint, printing = false;

  // Reveal owns the side panel and speaker window. Its panel is a native copy;
  // preserve the original IDs in the slide and remove IDs only from that copy.
  function normalizeNotes() {
    const panel = reveal?.getRevealElement().querySelector('.speaker-notes');
    if (!panel) return;
    panel.querySelectorAll('[id]').forEach(node => {
      node.dataset.courseNoteId = node.id; node.removeAttribute('id');
    });
  }
  function setMode(next) {
    mode = next;
    document.body.dataset.courseMode = mode;
    const ru = !document.documentElement.lang.startsWith('en');
    modeButton.textContent = mode === 'study' ? (ru ? 'Аудитория' : 'Present') : (ru ? 'Изучение' : 'Study');
    modeButton.setAttribute('aria-label', mode === 'study' ? (ru ? 'Режим аудитории' : 'Presentation mode') : (ru ? 'Самостоятельное изучение' : 'Study mode'));
    reveal.configure({showNotes: !printPdf && mode === 'study'});
    normalizeNotes();
  }
  function exposeNote(target) {
    if (!reveal || !target.closest('aside.notes')) return null;
    const slide = target.closest('section');
    if (slide && slide !== reveal.getCurrentSlide()) {
      const indices = reveal.getIndices(slide); reveal.slide(indices.h, indices.v || 0);
    }
    if (!reveal.getConfig().showNotes) reveal.configure({showNotes: true});
    normalizeNotes();
    const panel = reveal.getRevealElement().querySelector('.speaker-notes');
    const identified = target.closest('[id]');
    return identified && panel?.querySelector(`[data-course-note-id="${CSS.escape(identified.id)}"]`) || panel;
  }
  window.CoursePresentation = {exposeNote};
  function initializeReveal(deck) {
    reveal = deck;
    if (printPdf || reveal.isSpeakerNotes()) { reveal.configure({showNotes: false}); return; }
    modeButton = document.createElement('button');
    modeButton.type = 'button'; modeButton.className = 'course-mode-toggle';
    modeButton.addEventListener('click', () => setMode(mode === 'study' ? 'lecture' : 'study'));
    document.body.append(modeButton);
    // Native notes content is refreshed on slide/fragment changes. Normalize its
    // copied identifiers after each update without touching the source subtree.
    const panel = reveal.getRevealElement().querySelector('.speaker-notes');
    if (panel) {
      new MutationObserver(normalizeNotes).observe(panel, {childList: true, subtree: true});
      panel.addEventListener('toggle', event => {
        if (event.target.tagName !== 'DETAILS') return;
        const index = Array.from(panel.querySelectorAll('details')).indexOf(event.target);
        const original = reveal.getCurrentSlide()?.querySelectorAll('aside.notes details')[index];
        if (original) original.open = event.target.open;
      }, true);
    }
    setMode(mode);
    reveal.on('slidechanged', normalizeNotes);
    window.CourseDisclosure?.expose(document.getElementById(decodeURIComponent(location.hash.replace(/^#\/?/, ''))));
  }

  function labelTabPanels() {
    document.querySelectorAll('.panel-tabset > .tab-content > div').forEach((panel) => {
      if (panel.querySelector(':scope > .course-print-tab-title')) return;
      const label = panel.getAttribute('aria-labelledby');
      const tab = (label && document.getElementById(label)) || [...panel.parentElement.parentElement.querySelectorAll('a[href]')].find((link) => link.hash === '#' + panel.id);
      if (!tab) return;
      const title = document.createElement('div');
      title.className = 'course-print-tab-title';
      title.textContent = tab.textContent;
      panel.prepend(title);
    });
  }

  function expandForPrint() {
    if (printing) return;
    printing = true;
    if (reveal) { notesBeforePrint = reveal.getConfig().showNotes; reveal.configure({showNotes: false}); }
    document.querySelectorAll('details:not([open])').forEach((element) => {
      openedForPrint.push(element);
      element.open = true;
    });
    document.querySelectorAll('.callout .collapse:not(.show), .course-answer .collapse:not(.show)').forEach((element) => {
      expandedForPrint.push(element);
      element.classList.add('show');
    });
    labelTabPanels();
  }

  function restoreAfterPrint() {
    if (printPdf) return; // The dedicated print view stays expanded until closed.
    openedForPrint.forEach((element) => { element.open = false; });
    expandedForPrint.forEach((element) => { element.classList.remove('show'); });
    openedForPrint = [];
    expandedForPrint = [];
    printing = false;
    if (reveal) { reveal.configure({showNotes: notesBeforePrint}); normalizeNotes(); }
  }

  function initialize() {
    labelTabPanels();
    const deck = window.Reveal;
    if (deck && document.querySelector('.reveal')) {
      if (deck.isReady()) initializeReveal(deck);
      else deck.on('ready', () => initializeReveal(deck));
    }
    if (printPdf) {
      // Выполнение после готовности DOM, до измерений Reveal для PDF и window.load.
      document.documentElement.classList.add('print-pdf');
      expandForPrint();
    }
    window.addEventListener('beforeprint', expandForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
