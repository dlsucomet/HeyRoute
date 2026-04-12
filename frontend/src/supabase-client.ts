import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage'
import 'react-native-url-polyfill/auto';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    /** 
     * Supabase automatically handles persistent storage of the auth session:
    */
    auth: { 
        storage: AsyncStorage, // use AsyncStorage for React Native
        autoRefreshToken: true, // automatically refreshes the token when it expires
        persistSession: true, // the session will be persisted in storage and automatically refreshed
        detectSessionInUrl: false, 
    },
});

export default supabase;