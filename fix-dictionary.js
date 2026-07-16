const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./plugins.json', 'utf8'));

// ═══ BLACKLISTS ═══

// WP core tables — NEVER include
const WP_BLACKLIST_TABLES = new Set([
    'posts','postmeta','comments','commentmeta','terms','termmeta',
    'term_relationships','term_taxonomy','options','users','usermeta',
    'links','linkmeta','registration_log','sessions'
]);

// Junk from regex false positives
const JUNK_TABLES = new Set([
    'statement','capabilities','user_level','user','options','posts',
    'postmeta','comments','terms','users','usermeta','wpr_rucss_used_css',
    'wpr_rocket_cache','wpr_above_the_fold','bwf_contact','bwfan_automations',
    'wfco_report_views','table','data','result','query','row','column',
    'value','key','name','type','id','status','meta','action','log'
]);

// WP core options
const WP_BLACKLIST_OPTIONS = new Set([
    'siteurl','home','blogname','blogdescription','admin_email','blog_public',
    'permalink_structure','category_base','tag_base','show_on_front',
    'page_on_front','page_for_posts','default_category','default_post_format',
    'default_ping_status','default_comment_status','active_plugins','template',
    'stylesheet','nonce_key','nonce_salt','db_upgraded','upload_path',
    'upload_url_path','thumbnail_size_w','thumbnail_size_h','medium_size_w',
    'medium_size_h','large_size_w','large_size_h','cron','sidebars_widgets',
    'widget_text','nav_menu_options','wp_user_roles'
]);

// Core plugins that own generic prefixes
const CORE_PREFIXES = {
    'woocommerce': ['wc_', 'woocommerce_'],
    'action-scheduler': ['actionscheduler_'],
    'elementor': ['elementor_'],
    'wordpress-seo': ['yoast_', 'wpseo_'],
    'rank-math': ['rank_math_'],
    'contact-form-7': ['wpcf7_'],
    'wpforms': ['wpforms_'],
    'akismet': ['akismet_'],
    'jetpack': ['jetpack_'],
};

// ═══ FIX ═══

let fixCount = 0;

for (const [slug, info] of Object.entries(d.plugins)) {

    // Fix tables
    if (info.tables) {
        const orig = info.tables.length;
        info.tables = info.tables.filter(t => {
            const tl = t.toLowerCase();
            if (WP_BLACKLIST_TABLES.has(tl)) return false;
            if (JUNK_TABLES.has(tl)) return false;
            if (tl.length < 3) return false;
            // Only core plugins own their generic prefixes
            for (const [coreSlug, prefs] of Object.entries(CORE_PREFIXES)) {
                if (coreSlug === slug) continue;
                if (prefs.some(p => tl.startsWith(p))) return false;
            }
            return true;
        });
        fixCount += orig - info.tables.length;
    }

    // Fix table_prefixes — only if plugin actually has tables with that prefix
    if (info.table_prefixes) {
        const tables = (info.tables || []).map(t => t.toLowerCase());
        const orig = info.table_prefixes.length;
        info.table_prefixes = info.table_prefixes.filter(p => {
            const pl = p.toLowerCase();
            // Core prefix check
            for (const [coreSlug, prefs] of Object.entries(CORE_PREFIXES)) {
                if (coreSlug === slug) continue;
                if (prefs.some(cp => pl.startsWith(cp) || cp.startsWith(pl))) return false;
            }
            // Must have at least one table with this prefix
            if (!tables.some(t => t.startsWith(pl))) return false;
            return true;
        });
        fixCount += orig - info.table_prefixes.length;
    }

    // Fix options — remove WP core
    if (info.options) {
        const orig = info.options.length;
        info.options = info.options.filter(o => {
            const ol = o.toLowerCase();
            if (WP_BLACKLIST_OPTIONS.has(ol)) return false;
            if (ol.length < 3) return false;
            return true;
        });
        fixCount += orig - info.options.length;
    }
}

d.stats = { total: Object.keys(d.plugins).length };
d.updated = new Date().toISOString().split('T')[0];

fs.writeFileSync('./plugins.json', JSON.stringify(d, null, 2));
console.log('Fixed entries:', fixCount);
console.log('Final:', Object.keys(d.plugins).length, 'plugins');
