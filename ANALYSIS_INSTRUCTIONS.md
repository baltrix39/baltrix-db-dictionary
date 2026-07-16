# Инструкция анализа плагинов WordPress

## Цель
Определить какие таблицы БД, опции, транзиенты и крон-задачи **создаёт** плагин (а не просто использует).

## Что ИСКЛЮЧАТЬ (не добавлять в словарь)

### WordPress Core таблицы
НИКОГДА не включать:
- `wp_posts`, `wp_postmeta`, `wp_comments`, `wp_commentmeta`
- `wp_terms`, `wp_termmeta`, `wp_term_relationships`, `wp_term_taxonomy`
- `wp_options`, `wp_users`, `wp_usermeta`
- `wp_links`, `wp_linkmeta`

### Shared infrastructure
- `actionscheduler_*` — принадлежит WooCommerce / Action Scheduler плагину, НЕ другим
- Любые таблицы, которые создают хостинг-провайдеры (hostinger, cloudways)

### Таблицы которые плагин ТОЛЬКО ЧИТАЕТ
Если плагин делает `SELECT * FROM wp_some_table` — это НЕ его таблица. Его таблицы — те, он делает `CREATE TABLE` или `dbDelta()`.

## Что ВКЛЮЧАТЬ

### Таблицы (только если плагин их СОЗДАЁТ)
Искать в коде:
- `dbDelta( "CREATE TABLE {$wpdb->prefix}something" )`
- `$wpdb->prefix . 'something'` в контексте CREATE/INSERT
- `CREATE TABLE IF NOT EXISTS` 

### Опции (только если плагин их РЕГИСТРИРУЕТ)
Искать:
- `register_setting( 'group', 'option_name' )`
- `add_option( 'option_name' )` / `update_option( 'option_name' )` — но ТОЛЬКО с конкретным именем, не переменной
- Опции с уникальным префиксом плагина (не `siteurl`, `home`, и т.д.)

### Транзиенты
- `set_transient( 'name', ... )` — с конкретным именем

### Крон-задачи
- `wp_schedule_event( ..., 'hook_name' )` — с конкретным именем хука

## Как определять slug плагина
Slug = имя директории плагина (первый уровень в ZIP).
Пример: `woocommerce/woocommerce.php` → slug = `woocommerce`

## Формат вывода
```json
{
  "slug": "plugin-name",
  "name": "Plugin Name",
  "tables": ["prefix_specific_table"],
  "table_prefixes": ["prefix_"],
  "options": ["option_name_"],
  "transients": ["transient_name_"],
  "cron": ["cron_hook_name"]
}
```

### Правила для prefixes
- `table_prefixes` — ТОЛЬКО если плагин создаёт ТАБЛИЦЫ с этим префиксом
- Не включать generic префиксы: `wc_`, `wp_`, `woocommerce_`除非плагин является основным
- Префикс должен быть уникальным для плагина

### Правила для options/transients/cron
- Использовать полные имена, если они известны
- Использовать префикс+`, если опций много с общим префиксом
- Не включать опции WordPress core
