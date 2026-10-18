import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL || ""),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY || "")
    }
  };
});
