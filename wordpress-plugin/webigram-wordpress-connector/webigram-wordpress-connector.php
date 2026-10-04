<?php
/**
 * Plugin Name: Webigram WordPress Connector
 * Description: Authenticated diagnostics connector for Webigram WordPress Doctor Deep Scan.
 * Version: 1.0.0
 * Author: Webigram
 * License: GPLv2 or later
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;

final class Webigram_WordPress_Connector {
    const VERSION = '1.0.0';
    const OPTION_TOKEN = 'webigram_connector_token';

    public static function boot() {
        add_action('rest_api_init', array(__CLASS__, 'routes'));
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('admin_post_webigram_connector_regenerate', array(__CLASS__, 'regenerate_token'));
    }

    public static function activate() {
        if (!get_option(self::OPTION_TOKEN)) {
            add_option(self::OPTION_TOKEN, wp_generate_password(64, false, false), '', false);
        }
    }

    private static function token() {
        $token = (string) get_option(self::OPTION_TOKEN, '');
        if (!$token) {
            $token = wp_generate_password(64, false, false);
            update_option(self::OPTION_TOKEN, $token, false);
        }
        return $token;
    }

    public static function authorize(WP_REST_Request $request) {
        $provided = trim((string) $request->get_header('x-webigram-token'));
        if (!$provided) {
            $auth = trim((string) $request->get_header('authorization'));
            if (stripos($auth, 'Bearer ') === 0) $provided = trim(substr($auth, 7));
        }
        $expected = self::token();
        return $provided && strlen($provided) === strlen($expected) && hash_equals($expected, $provided);
    }

    public static function routes() {
        register_rest_route('webigram/v1', '/health', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array(__CLASS__, 'health'),
            'permission_callback' => array(__CLASS__, 'authorize'),
        ));
        register_rest_route('webigram/v1', '/mail-test', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array(__CLASS__, 'mail_test'),
            'permission_callback' => array(__CLASS__, 'authorize'),
            'args' => array('email' => array('required' => true, 'sanitize_callback' => 'sanitize_email')),
        ));
    }

    private static function plugin_inventory() {
        if (!function_exists('get_plugins')) require_once ABSPATH . 'wp-admin/includes/plugin.php';
        if (!function_exists('wp_update_plugins')) require_once ABSPATH . 'wp-includes/update.php';
        wp_update_plugins();
        $all = get_plugins();
        $active = (array) get_option('active_plugins', array());
        $network = is_multisite() ? array_keys((array) get_site_option('active_sitewide_plugins', array())) : array();
        $updates = get_site_transient('update_plugins');
        $out = array();
        foreach ($all as $file => $data) {
            $slug = dirname($file);
            if ($slug === '.') $slug = basename($file, '.php');
            $u = isset($updates->response[$file]) ? $updates->response[$file] : null;
            $out[] = array(
                'slug' => sanitize_key($slug),
                'file' => $file,
                'name' => isset($data['Name']) ? wp_strip_all_tags($data['Name']) : $slug,
                'version' => isset($data['Version']) ? (string) $data['Version'] : null,
                'active' => in_array($file, $active, true) || in_array($file, $network, true),
                'networkActive' => in_array($file, $network, true),
                'updateAvailable' => (bool) $u,
                'newVersion' => $u && isset($u->new_version) ? (string) $u->new_version : null,
            );
        }
        return $out;
    }

    private static function theme_inventory() {
        if (!function_exists('wp_update_themes')) require_once ABSPATH . 'wp-includes/update.php';
        wp_update_themes();
        $updates = get_site_transient('update_themes');
        $active = wp_get_theme();
        $out = array();
        foreach (wp_get_themes() as $slug => $theme) {
            $u = isset($updates->response[$slug]) ? $updates->response[$slug] : null;
            $out[] = array(
                'slug' => sanitize_key($slug),
                'name' => $theme->get('Name'),
                'version' => $theme->get('Version'),
                'active' => $active->get_stylesheet() === $slug,
                'parent' => $theme->parent() ? $theme->parent()->get_stylesheet() : null,
                'updateAvailable' => (bool) $u,
                'newVersion' => $u && isset($u['new_version']) ? (string) $u['new_version'] : null,
            );
        }
        return $out;
    }

    private static function core_update_count() {
        if (!function_exists('wp_version_check')) require_once ABSPATH . 'wp-includes/update.php';
        wp_version_check();
        $u = get_site_transient('update_core');
        if (empty($u->updates) || !is_array($u->updates)) return 0;
        foreach ($u->updates as $item) {
            if (isset($item->response) && $item->response === 'upgrade') return 1;
        }
        return 0;
    }

    private static function cron_info() {
        $cron = _get_cron_array();
        $events = 0; $overdue = 0; $oldest = null; $now = time();
        if (is_array($cron)) foreach ($cron as $ts => $hooks) {
            foreach ((array) $hooks as $entries) {
                foreach ((array) $entries as $instances) $events += count((array) $instances);
            }
            if ((int) $ts < $now - 300) {
                $overdue++;
                if ($oldest === null || (int) $ts < $oldest) $oldest = (int) $ts;
            }
        }
        $loopback = null;
        if (function_exists('wp_remote_get')) {
            $r = wp_remote_get(site_url('/wp-cron.php?doing_wp_cron=' . rawurlencode((string) microtime(true))), array(
                'timeout' => 5, 'redirection' => 2, 'sslverify' => true, 'blocking' => true,
            ));
            $loopback = !is_wp_error($r) && (int) wp_remote_retrieve_response_code($r) < 500;
        }
        return array('events' => $events, 'overdue' => $overdue, 'oldestOverdue' => $oldest, 'loopback' => $loopback);
    }

    private static function autoload_bytes() {
        global $wpdb;
        $values = array('yes', 'on', 'auto-on', 'auto');
        $placeholders = implode(',', array_fill(0, count($values), '%s'));
        $sql = "SELECT COALESCE(SUM(LENGTH(option_value)),0) FROM {$wpdb->options} WHERE autoload IN ($placeholders)";
        return (int) $wpdb->get_var($wpdb->prepare($sql, ...$values));
    }

    private static function smtp_plugins($plugins) {
        $known = array('wp-mail-smtp','fluent-smtp','post-smtp','easy-wp-smtp','smtp-mailer','mailgun','sendgrid-email-delivery-simplified');
        $out = array();
        foreach ($plugins as $p) if (!empty($p['active']) && in_array($p['slug'], $known, true)) $out[] = $p['slug'];
        return $out;
    }

    private static function woocommerce_info($plugins) {
        $active = false; $version = null;
        foreach ($plugins as $p) if ($p['slug'] === 'woocommerce' && !empty($p['active'])) { $active = true; $version = $p['version']; break; }
        if (!$active && !class_exists('WooCommerce')) return array('active' => false);
        $pending = null;
        if (function_exists('as_get_scheduled_actions')) {
            $ids = as_get_scheduled_actions(array('status' => 'pending', 'per_page' => 101, 'return_format' => 'ids'));
            $pending = is_array($ids) ? count($ids) : 0;
        }
        return array(
            'active' => true,
            'version' => defined('WC_VERSION') ? WC_VERSION : $version,
            'cartUrl' => function_exists('wc_get_cart_url') ? wc_get_cart_url() : null,
            'checkoutUrl' => function_exists('wc_get_checkout_url') ? wc_get_checkout_url() : null,
            'myAccountUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : null,
            'actionSchedulerPending' => $pending,
            'actionSchedulerCountCapped' => $pending !== null && $pending >= 101,
        );
    }

    public static function health() {
        global $wpdb, $wp_version;
        $plugins = self::plugin_inventory();
        $themes = self::theme_inventory();
        $plugin_updates = array_filter($plugins, function($p){ return !empty($p['updateAvailable']); });
        $theme_updates = array_filter($themes, function($t){ return !empty($t['updateAvailable']); });
        $core_updates = self::core_update_count();
        $disk_total = @disk_total_space(ABSPATH);
        $disk_free = @disk_free_space(ABSPATH);

        return rest_ensure_response(array(
            'connector' => array('version' => self::VERSION),
            'wordpress' => array('version' => $wp_version, 'multisite' => is_multisite(), 'siteUrl' => site_url('/'), 'homeUrl' => home_url('/')),
            'environment' => array(
                'phpVersion' => PHP_VERSION,
                'dbVersion' => $wpdb->db_version(),
                'wpMemoryLimit' => defined('WP_MEMORY_LIMIT') ? WP_MEMORY_LIMIT : null,
                'wpMaxMemoryLimit' => defined('WP_MAX_MEMORY_LIMIT') ? WP_MAX_MEMORY_LIMIT : null,
                'phpMemoryLimit' => ini_get('memory_limit'),
                'uploadMaxFilesize' => ini_get('upload_max_filesize'),
                'postMaxSize' => ini_get('post_max_size'),
                'maxExecutionTime' => (int) ini_get('max_execution_time'),
                'wpDebug' => defined('WP_DEBUG') ? (bool) WP_DEBUG : false,
                'wpDebugDisplay' => defined('WP_DEBUG_DISPLAY') ? (bool) WP_DEBUG_DISPLAY : false,
                'wpDebugLog' => defined('WP_DEBUG_LOG') ? WP_DEBUG_LOG : false,
                'https' => is_ssl(),
                'diskTotalBytes' => is_numeric($disk_total) ? (float) $disk_total : null,
                'diskFreeBytes' => is_numeric($disk_free) ? (float) $disk_free : null,
            ),
            'updates' => array(
                'core' => $core_updates,
                'plugins' => count($plugin_updates),
                'themes' => count($theme_updates),
                'total' => $core_updates + count($plugin_updates) + count($theme_updates),
            ),
            'plugins' => array_values($plugins),
            'themes' => array_values($themes),
            'cron' => self::cron_info(),
            'cache' => array(
                'wpCache' => defined('WP_CACHE') ? (bool) WP_CACHE : false,
                'objectCache' => function_exists('wp_using_ext_object_cache') ? (bool) wp_using_ext_object_cache() : false,
                'advancedCacheFile' => file_exists(WP_CONTENT_DIR . '/advanced-cache.php'),
                'objectCacheFile' => file_exists(WP_CONTENT_DIR . '/object-cache.php'),
            ),
            'database' => array('autoloadBytes' => self::autoload_bytes()),
            'mail' => array('smtpPlugins' => self::smtp_plugins($plugins)),
            'woocommerce' => self::woocommerce_info($plugins),
            'generatedAt' => gmdate('c'),
        ));
    }

    public static function mail_test(WP_REST_Request $request) {
        $email = sanitize_email((string) $request->get_param('email'));
        if (!is_email($email)) return new WP_Error('webigram_bad_email', 'Invalid email address.', array('status' => 400));
        $subject = sprintf('[Webigram] WordPress mail test from %s', wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES));
        $message = "This is a WordPress wp_mail() test requested from Webigram WordPress Doctor.\n\nSite: " . home_url('/') . "\nTime: " . gmdate('c') . "\n";
        $sent = wp_mail($email, $subject, $message);
        return rest_ensure_response(array(
            'accepted' => (bool) $sent,
            'message' => $sent
                ? 'WordPress accepted the message for sending. Inbox delivery is not guaranteed by wp_mail().'
                : 'wp_mail() returned false. Check SMTP/mail configuration and WordPress logs.',
        ));
    }

    public static function admin_menu() {
        add_management_page('Webigram Connector', 'Webigram Connector', 'manage_options', 'webigram-connector', array(__CLASS__, 'admin_page'));
    }

    public static function regenerate_token() {
        if (!current_user_can('manage_options')) wp_die('Forbidden', 403);
        check_admin_referer('webigram_connector_regenerate');
        update_option(self::OPTION_TOKEN, wp_generate_password(64, false, false), false);
        wp_safe_redirect(add_query_arg(array('page' => 'webigram-connector', 'regenerated' => '1'), admin_url('tools.php')));
        exit;
    }

    public static function admin_page() {
        if (!current_user_can('manage_options')) return;
        $token = self::token();
        ?>
        <div class="wrap">
            <h1>Webigram WordPress Connector</h1>
            <p>این افزونه فقط برای Deep Scan ابزار WordPress Doctor وبیگرام است. توکن را مثل رمز نگه دارید.</p>
            <table class="widefat striped" style="max-width:900px">
                <tbody>
                    <tr><th style="width:220px">Connector status</th><td><strong style="color:#16803b">Active</strong></td></tr>
                    <tr><th>Health endpoint</th><td><code><?php echo esc_html(rest_url('webigram/v1/health')); ?></code></td></tr>
                    <tr><th>Connector token</th><td><input id="webigram-token" type="text" readonly value="<?php echo esc_attr($token); ?>" style="width:100%;font-family:monospace" /><p><button type="button" class="button" onclick="navigator.clipboard.writeText(document.getElementById('webigram-token').value)">Copy token</button></p></td></tr>
                </tbody>
            </table>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:18px">
                <input type="hidden" name="action" value="webigram_connector_regenerate" />
                <?php wp_nonce_field('webigram_connector_regenerate'); ?>
                <button class="button button-secondary" type="submit" onclick="return confirm('Regenerate token? The old token will stop working immediately.')">Regenerate token</button>
            </form>
            <p style="margin-top:18px;color:#646970">Webigram never needs your WordPress username, password, database password, or hosting credentials.</p>
        </div>
        <?php
    }
}
register_activation_hook(__FILE__, array('Webigram_WordPress_Connector', 'activate'));
Webigram_WordPress_Connector::boot();
