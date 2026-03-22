// assets/js/config.js

// Supabase Conffit (Nämä vaihdetaan oikeisiin)
export const SUPABASE_URL = 'https://xbeonksexpjvekqjxoph.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_yfN0ScRrJr-P2Nfa8yRJRw_x_1RM9Tn';

// Tämä on "BaaS" rajapinta
export const config = {
    // Odotetaan että Supabase-kirjasto on haettu CDN:stä HTML-tiedostossa
    // <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    initSupabase: function () {
        if (window.supabase) {
            return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        console.warn("Supabase library not loaded.");
        return null;
    }
};
