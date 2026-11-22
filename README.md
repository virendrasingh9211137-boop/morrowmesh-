# Morrowmesh

Morrowmesh is a black chat interface that streams answers from Groq's `openai/gpt-oss-20b` model. A Cloudflare Worker securely proxies requests to Groq, so visitors do not need an account or API key. The Groq key stays in a Worker secret and must never be committed to GitHub.

## Cost

Keep Groq on its **Free** plan and Cloudflare Workers on its **Free** plan. Do not upgrade either account or add a payment method. Groq Free has model-specific usage limits; once reached, replies pause until limits reset. Cloudflare Workers Free has a daily request limit; over-limit requests stop working until reset. Check the providers' current terms and dashboards because limits can change. [Groq rate limits](https://console.groq.com/docs/rate-limits) · [Groq billing FAQ](https://console.groq.com/docs/billing-faqs) · [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

GitHub Pages is free for public repositories on eligible GitHub accounts. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## One-time setup for the owner

You need Node.js installed. Open PowerShell in the project folder and run:

```powershell
npm install
npx wrangler@latest login
npx wrangler@latest deploy --config worker/wrangler.jsonc
npx wrangler@latest secret put GROQ_API_KEY --config worker/wrangler.jsonc
```

When Wrangler asks for the secret, paste the Groq API key you created. It is stored by Cloudflare as a secret; do not paste it into chat, `public/config.js`, or GitHub.

After deploy, Wrangler prints a URL like `https://morrowmesh-ai.your-account.workers.dev`. Put that base URL (without `/chat`) in `public/config.js`:

```js
window.MORROWMESH_API_URL = 'https://morrowmesh-ai.your-account.workers.dev';
```

Then publish the repository to GitHub Pages. The Worker only accepts requests from GitHub Pages `*.github.io` sites and the local preview at `localhost:4173`.

## Run locally

On Windows, double-click **Open Morrowmesh.bat** to start the local preview and open it in your browser. Node.js must be installed. The launcher reuses the preview if it is already running.

Or start it from PowerShell:

```powershell
npm start
```

Open <http://localhost:4173>. To use the Groq-backed chat locally, complete the Worker setup above and configure its URL in `public/config.js`. Chat history is stored in each visitor's browser and is not shared across devices.

## Publish on GitHub Pages

1. Push this project to a **public** GitHub repository.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Wait for the included Pages workflow to finish, then open the published site.
4. Visitors can chat immediately without entering a key, as long as the Worker URL is configured and the free provider quotas are available.

## How the connection works

The browser sends chat messages to the Morrowmesh Worker. The Worker adds the private Groq key and calls Groq. The Worker does not use Cloudflare Workers AI, so there are no Workers AI charges. Free-tier quotas still apply, and the owner must keep both accounts on their free plans.
