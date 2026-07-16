const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ZIP_DIR = path.join(__dirname, 'plugins-zip');
const TEMP_DIR = path.join(__dirname, 'temp-analyze');
const OUTPUT_FILE = path.join(__dirname, 'plugins.json');

// WordPress core — НИКОГДА не включать
const WP_CORE_TABLES = new Set([
    'posts','postmeta','comments','commentmeta','terms','termmeta',
    'term_relationships','term_taxonomy','options','users','usermeta',
    'links','linkmeta','registration_log','sessions'
]);

const WP_CORE_OPTIONS = new Set([
    'siteurl','home','blogname','blogdescription','admin_email','blog_public',
    'permalink_structure','category_base','tag_base','show_on_front',
    'page_on_front','page_for_posts','default_category','default_post_format',
    'default_ping_status','default_comment_status','active_plugins','template',
    'stylesheet','nonce_key','nonce_salt','db_upgraded','upload_path',
    'upload_url_path','thumbnail_size_w','thumbnail_size_h','medium_size_w',
    'medium_size_h','large_size_w','large_size_h','cron','sidebars_widgets',
    'widget_text','nav_menu_options','wp_user_roles','secret'
]);

// Generic prefixes that belong to specific core plugins
const GENERIC_PREFIXES = {
    'woocommerce': ['wc_', 'woocommerce_'],
    'action-scheduler': ['actionscheduler_'],
    'elementor': ['elementor_'],
    'wordpress-seo': ['yoast_', 'wpseo_'],
    'rank-math': ['rank_math_'],
};

function extractData(pluginDir, slug) {
    const result = { tables: new Set(), options: new Set(), transients: new Set(), cron: new Set() };

    function scanDir(dir) {
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory() && !['vendor','node_modules','.git','tests','languages','includes/vendor','build'].includes(item.name)) {
                    scanDir(fullPath);
                } else if (item.isFile() && item.name.endsWith('.php')) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');

                        // ═══ TABLES ═══
                        // 1. dbDelta() — самый надёжный индикатор
                        const dbDeltaRegex = /dbDelta\s*\(\s*(?:['"]|<<\s*['"]|HEREDOC)\s*(?:IF\s+NOT\s+EXISTS\s+)?(?:[\{`]?)(\w+)[\}`]?/gi;
                        let match;
                        while ((match = dbDeltaRegex.exec(content)) !== null) {
                            const name = match[1].toLowerCase().replace(/[^a-z0-9_]/g, '');
                            if (name.length >= 3 && !WP_CORE_TABLES.has(name)) result.tables.add(name);
                        }

                        // 2. CREATE TABLE
                        const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[{`]?(\w+)[`}?]/gi;
                        while ((match = createRegex.exec(content)) !== null) {
                            const name = match[1].toLowerCase().replace(/[^a-z0-9_]/g, '');
                            if (name.length >= 3 && !WP_CORE_TABLES.has(name)) result.tables.add(name);
                        }

                        // 3. $wpdb->prefix . 'something' — только в контексте CREATE/INSERT/UPDATE/DELETE
                        const prefixContextRegex = /(dbDelta|CREATE|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s*\(?\s*\$wpdb->prefix\s*\.\s*['"]([a-z0-9_]+)/gi;
                        while ((match = prefixContextRegex.exec(content)) !== null) {
                            const name = match[2].toLowerCase();
                            if (name.length >= 3 && !WP_CORE_TABLES.has(name)) result.tables.add(name);
                        }

                        // ═══ OPTIONS ═══
                        // 1. register_setting() — точное имя
                        const regRegex = /register_setting\s*\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)/gi;
                        while ((match = regRegex.exec(content)) !== null) {
                            const name = match[1].trim();
                            if (name.length >= 3 && !WP_CORE_OPTIONS.has(name) && !name.startsWith('_')) {
                                result.options.add(name);
                            }
                        }

                        // 2. add_option/update_option — только с литеральным именем
                        const optRegex = /(?:add|update)_option\s*\(\s*['"]([a-z0-9_]+)['"]/gi;
                        while ((match = optRegex.exec(content)) !== null) {
                            const name = match[1];
                            if (name.length >= 5 && !WP_CORE_OPTIONS.has(name) && !name.startsWith('_') && !name.startsWith('site') && !name.startsWith('blog')) {
                                result.options.add(name);
                            }
                        }

                        // ═══ TRANSIENTS ═══
                        const transRegex = /set_transient\s*\(\s*['"]([a-z0-9_]+)['"]/gi;
                        while ((match = transRegex.exec(content)) !== null) {
                            if (match[1].length >= 3) result.transients.add(match[1]);
                        }

                        // ═══ CRON ═══
                        const cronRegex = /wp_schedule_event\s*\([^,]+,\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)/gi;
                        while ((match = cronRegex.exec(content)) !== null) {
                            if (match[1].length >= 3) result.cron.add(match[1]);
                        }

                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    scanDir(pluginDir);

    // ═══ POST-PROCESSING ═══

    // Удаляем generic prefixes если.slug не является core плагином
    for (const [coreSlug, prefs] of Object.entries(GENERIC_PREFIXES)) {
        if (slug === coreSlug) continue;
        for (const prefix of prefs) {
            result.tables = new Set([...result.tables].filter(t => !t.startsWith(prefix)));
        }
    }

    // Определяем table_prefixes — только если есть 2+ таблицы с общим префиксом
    const tablePrefixes = new Set();
    const tables = [...result.tables];
    if (tables.length >= 2) {
        // Группируем по префиксу (первые 2 с подчёркиванием)
        const prefixCount = {};
        for (const t of tables) {
            const parts = t.split('_');
            if (parts.length >= 2) {
                const prefix = parts[0] + '_';
                prefixCount[prefix] = (prefixCount[prefix] || 0) + 1;
            }
        }
        for (const [prefix, count] of Object.entries(prefixCount)) {
            if (count >= 2) tablePrefixes.add(prefix);
        }
    }

    return {
        tables: [...result.tables],
        table_prefixes: [...tablePrefixes],
        options: [...result.options],
        transients: [...result.transients],
        cron: [...result.cron],
    };
}

function getPluginName(slug) {
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function main() {
    console.log('=== Анализ плагинов (v2 — smart) ===\n');

    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    const zipFiles = fs.readdirSync(ZIP_DIR).filter(f => f.endsWith('.zip'));
    console.log(`ZIP: ${zipFiles.length}\n`);

    const plugins = {};
    let analyzed = 0;

    for (const zipFile of zipFiles) {
        analyzed++;
        const slug = zipFile.split('.')[0].replace(/\.\d+\.\d+\.\d+$/, '');
        process.stdout.write(`[${analyzed}/${zipFiles.length}] ${slug}... `);

        const zipPath = path.join(ZIP_DIR, zipFile);
        const extractDir = path.join(TEMP_DIR, slug);

        try {
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
            execSync(`tar -xf "${zipPath}" -C "${TEMP_DIR}"`, { stdio: 'ignore' });

            const extractedItems = fs.readdirSync(extractDir);
            let pluginDir = extractDir;
            if (extractedItems.length === 1 && fs.statSync(path.join(extractDir, extractedItems[0])).isDirectory()) {
                pluginDir = path.join(extractDir, extractedItems[0]);
            }

            const data = extractData(pluginDir, slug);

            plugins[slug] = {
                name: getPluginName(slug),
                slug: slug,
                ...data,
            };

            const total = data.tables.length + data.options.length + data.transients.length + data.cron.length;
            console.log(`✓ (${data.tables.length}t ${data.options.length}o ${data.transients.length}tr ${data.cron.length}c)`);

            fs.rmSync(extractDir, { recursive: true, force: true });
        } catch (e) {
            console.log(`✗ (${e.message})`);
        }
    }

    // Merge with existing
    let existing = {};
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            existing = data.plugins || {};
        } catch (e) {}
    }

    const merged = { ...existing, ...plugins };

    const output = {
        version: '4.0.0',
        updated: new Date().toISOString().split('T')[0],
        stats: { total: Object.keys(merged).length },
        plugins: merged,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

    console.log(`\n=== Готово! ===`);
    console.log(`Анализировано: ${analyzed}`);
    console.log(`В словаре: ${Object.keys(merged).length}`);
}

main();
