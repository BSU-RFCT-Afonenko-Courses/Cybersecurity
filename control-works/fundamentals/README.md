# Печатные варианты контрольной работы

Варианты находятся в `variant-1.typ` и `variant-2.typ`. Общие настройки
оформления вынесены в `styles.typ`, а элементы бланка — в `components.typ`.

Для сборки обоих PDF из этой папки нужен Typst и установленный шрифт
Times New Roman:

```bash
mkdir -p _output
typst compile variant-1.typ _output/variant-1.pdf
typst compile variant-2.typ _output/variant-2.pdf
```

Каждый вариант рассчитан на двустороннюю печать на одном листе A4.
