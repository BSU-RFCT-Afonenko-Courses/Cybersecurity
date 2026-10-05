/* Подготовка к печати не зависит от навигации Reveal и темы.
 * Раскрывается только содержимое DOM, оставшееся после отбора по профилю;
 * исключённые ядром материалы преподавателя не восстанавливаются. */
(() => {
  'use strict';
  let openedForPrint = [];
  let expandedForPrint = [];
  const printPdf = new URLSearchParams(window.location.search).has('print-pdf');

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
  }

  function initialize() {
    labelTabPanels();
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
