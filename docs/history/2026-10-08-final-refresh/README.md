# Проверки курса 8 октября 2026

Эта папка сохраняет точные native receipts, исходные verification helpers и
SHA256-карту после установки Core 4.0.1 и финального student/full/student/Body
цикла. Она не задаёт нормативный контракт. Правила — в опубликованном
Core v4.0.1 spec/index.md; команды курса — в текущем README.

SOURCE-MAP.json связывает каждый файл с источником и digest. Снимки двух
документов в documents/original и documents/current исторические; после
Git-сохранения Root может убрать их из active docs только после byte-equality
проверки reachable Git blobs. До commit эта папка не является durable Git
историей. Полные native output trees, caches и архивы сюда не копируются.
