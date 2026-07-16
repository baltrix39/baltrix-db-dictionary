const fs = require('fs');
const d = JSON.parse(fs.readFileSync('./plugins.json', 'utf8'));

const wp_core = new Set(['posts','postmeta','comments','commentmeta','terms','termmeta','term_relationships','term_taxonomy','options','users','usermeta','links','linkmeta','registration_log','sessions']);
const junk = new Set(['statement','capabilities','user_level','user','options','posts','postmeta','comments','terms','users','usermeta','wpr_rucss_used_css','wpr_rocket_cache','wpr_above_the_fold','bwf_contact','bwfan_automations','wfco_report_views']);
const wc_core = new Set(['wc_orders','wc_orders_meta','wc_order_addresses','wc_order_operational_data','wc_product_meta_lookup','wc_tax_rate_classes','wc_category_lookup','wc_customer_lookup','wc_download_log','woocommerce_attribute_taxonomies','wc_tax_rates','wc_tax_rate_locations','wc_order_coupon_lookup','wc_order_product_lookup','wc_order_stats','wc_order_tax_lookup','wc_gpf_render_cache','wc_log']);
const rm_core_tables = new Set((d.plugins['rank-math']||{}).tables ? d.plugins['rank-math'].tables.map(t=>t.toLowerCase()) : []);

const core_prefixes = {
  'woocommerce': ['wc_', 'woocommerce_'],
  'elementor': ['elementor_'],
  'rank-math': ['rank_math_'],
  'wordpress-seo': ['yoast_', 'wpseo_'],
  'contact-form-7': ['wpcf7_'],
  'wpforms': ['wpforms_'],
  'akismet': ['akismet_'],
  'jetpack': ['jetpack_'],
  'action-scheduler': ['actionscheduler_'],
};

let fixCount = 0;
for (const [slug, info] of Object.entries(d.plugins)) {
  if (info.tables) {
    const orig = info.tables.length;
    info.tables = info.tables.filter(t => {
      const tl = t.toLowerCase();
      if (wp_core.has(tl)) return false;
      if (junk.has(tl)) return false;
      if (wc_core.has(tl) && slug !== 'woocommerce') return false;
      if (rm_core_tables.has(tl) && slug !== 'rank-math') return false;
      if (slug !== 'woocommerce' && slug !== 'action-scheduler' && tl.startsWith('actionscheduler_')) return false;
      // Remove ALL woocommerce_ and wc_ tables from non-WooCommerce plugins
      if (slug !== 'woocommerce' && (tl.startsWith('woocommerce_') || tl.startsWith('wc_'))) return false;
      return true;
    });
    fixCount += orig - info.tables.length;
  }

  if (info.table_prefixes) {
    const orig = info.table_prefixes.length;
    info.table_prefixes = info.table_prefixes.filter(p => {
      const pl = p.toLowerCase();
      for (const [core_slug, core_prefs] of Object.entries(core_prefixes)) {
        if (core_slug === slug) continue;
        if (core_prefs.some(cp => pl.startsWith(cp) || cp.startsWith(pl))) return false;
      }
      if (slug !== 'woocommerce' && slug !== 'action-scheduler' && pl.startsWith('actionscheduler_')) return false;
      return true;
    });
    fixCount += orig - info.table_prefixes.length;
  }
}

d.stats = { total: Object.keys(d.plugins).length };
d.updated = new Date().toISOString().split('T')[0];

fs.writeFileSync('./plugins.json', JSON.stringify(d, null, 2));
console.log('Fixed entries:', fixCount);
console.log('Final:', Object.keys(d.plugins).length, 'plugins');
