import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csrf: {
      // Behind reverse proxies (nginx) during trial deploy,
      // origin/proto headers can be inconsistent. For the 1-week AWS trial
      // we disable origin checking to avoid blocking login/register actions.
      checkOrigin: false,
    },
  },
};

export default config;
