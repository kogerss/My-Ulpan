import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://uyojzeqovrpfrzsuwsys.supabase.co";
const supabaseKey = "sb_publishable_H1CmipYJKbkwPuaWHYUKMA_v0F_1Tla";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL или ключ не заданы");
}

export const supabase = createClient(supabaseUrl, supabaseKey);