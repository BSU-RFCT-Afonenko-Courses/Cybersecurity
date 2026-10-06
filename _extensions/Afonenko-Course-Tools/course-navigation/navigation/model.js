/* Навигация курса: структура слайдов и история посещений, независимые от интерфейса. */
(function (root) {
  'use strict';
  const namespace = root.CourseNavigationModules = root.CourseNavigationModules || {};
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function groupEntries(entries, fallback) {
    const groups = [];
    let current;
    const slides = entries.map((entry, index) => {
      if (!current || (index > 0 && entries[index - 1].isTitle) || (entry.section && entry.section !== current.title) || entry.sectionStart) {
        current = { index: groups.length, title: entry.section || fallback, start: index, slides: [] };
        groups.push(current);
      }
      const slide = Object.assign({}, entry, { index, group: current.index });
      current.slides.push(slide);
      return slide;
    });
    return { slides, groups };
  }

  function collect(deck, labels) {
    const visible = deck.getSlides().filter(slide => {
      if (Array.from(slide.children).some(child => child.tagName === 'SECTION')) return false;
      let node = slide;
      while (node && node.tagName === 'SECTION') {
        if (node.getAttribute('data-visibility') === 'hidden') return false;
        node = node.parentElement;
      }
      // Режим прокрутки может оставить пустую бывшую группу без координат слайда.
      return Number.isFinite(deck.getIndices(slide).h);
    });
    const entries = visible.map((element, index) => {
      const heading = element.querySelector('h1,h2,h3,h4');
      const title = clean(heading && heading.textContent) || `${labels.slide} ${index + 1}`;
      const isTitle = element.id === 'title-slide';
      const sectionStart = !isTitle && !!heading && (heading.tagName === 'H1' || element.classList.contains('level1'));
      const clone = element.cloneNode(true);
      clone.querySelectorAll('aside.notes,script,style,.speaker-notes').forEach(node => node.remove());
      const indices = deck.getIndices(element);
      return {
        element, title, h: indices.h, v: indices.v || 0,
        section: isTitle ? labels.start : (sectionStart ? title : null),
        sectionStart, isTitle,
        search: clean(clone.textContent).toLocaleLowerCase()
      };
    });
    return groupEntries(entries, labels.material);
  }

  class VisitHistory {
    constructor(limit = 256) { this.limit = limit; this.entries = []; this.cursor = -1; }
    record(index) {
      if (this.entries[this.cursor] === index) return;
      this.entries = this.entries.slice(0, this.cursor + 1);
      this.entries.push(index);
      if (this.entries.length > this.limit) this.entries.shift();
      this.cursor = this.entries.length - 1;
    }
    move(direction) {
      const target = this.cursor + direction;
      if (target < 0 || target >= this.entries.length) return null;
      this.cursor = target;
      return this.entries[target];
    }
    canMove(direction) { const target = this.cursor + direction; return target >= 0 && target < this.entries.length; }
  }

  namespace.NavigationModel = { collect, groupEntries, VisitHistory };
  if (typeof module === 'object' && module.exports) module.exports = namespace.NavigationModel;
})(typeof window === 'undefined' ? globalThis : window);
