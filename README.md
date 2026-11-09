# HydrogenCMS storefront

This is a Shopify Hydrogen storefront that you edit in the **HydrogenCMS** app. HydrogenCMS gives
a headless store the theme editor you know from the Online Store: templates, sections, blocks,
theme settings, pages, menus, SEO and versions.

You deploy this storefront to Shopify Oxygen **once**. After that, everything you change in the
HydrogenCMS theme editor goes live when you publish. You don't edit code and you don't redeploy.

- [Install HydrogenCMS](#install-hydrogencms)
- [Deploy on Oxygen](#deploy-on-oxygen)
- [Local development](#local-development)
- [Update the storefront](#update-the-storefront)
- [Custom sections](#custom-sections)
- [Troubleshooting](#troubleshooting)

## Install HydrogenCMS

1. Install the **HydrogenCMS** app from the Shopify App Store.
2. In HydrogenCMS, open the **Setup guide** on Home.
3. **Choose a plan.** Every plan starts with a free trial, billed by Shopify.
4. **Connect your storefront.** Choose **Shopify Oxygen**, then follow the steps in
   [Deploy on Oxygen](#deploy-on-oxygen) below. The Setup guide shows the same steps, with the
   values you need and a copy button for each.

## Deploy on Oxygen

1. **Use this template.** At the top of this repository on GitHub, choose **Use this template ›
   Create a new repository**. Pick an owner and a name (for example `my-store-storefront`). It
   can be private or public.
2. **Create a Hydrogen storefront.** In your Shopify admin, go to **Hydrogen › Create
   storefront**. Choose **Set up GitHub continuous deployment**, connect GitHub and pick the
   repository you just created.
3. **Merge Shopify's pull request.** Shopify opens a pull request in your repository. Merge it,
   then wait for the production deployment to finish.
4. **Add the HydrogenCMS variables.** In Shopify, go to **Hydrogen › your storefront ›
   Storefront settings › Environments and variables** and add these to **Production**:

   | Variable | What it does |
   | --- | --- |
   | `HCMS_API_URL` | The HydrogenCMS address your storefront reads from and sends forms to. |
   | `HCMS_PREVIEW_SECRET` | Signs editor previews and form submissions. Keep it secret. |
   | `HCMS_PUBLIC_KEY` | Lets the storefront read your published theme. |

   Copy the values from the Setup guide (**Connect your storefront**) or from
   **Settings › Developers** in HydrogenCMS. Only HydrogenCMS admins can see them.
5. **Redeploy.** Variables apply only to new deployments. In Hydrogen, redeploy the latest
   production deployment (or push any commit).
6. **Check the connection.** Back in the Setup guide, paste your storefront's **Production URL**
   (for example `https://your-storefront.o2.myshopify.dev`) and select **Check connection**. If
   you see **Verify in a new tab**, select it, then **Refresh**. When it shows connected, pick a
   starting theme or import your Liquid theme, and open the theme editor.

Until the variables are added, every page of the storefront shows a **This storefront runs on
HydrogenCMS** setup screen that lists the missing variables (names only, never values). It goes
away after you add them and redeploy. `/__hcms/health` keeps answering, so **Check connection**
can tell you what's missing.

Shopify adds the store variables (`PUBLIC_STORE_DOMAIN`, `PUBLIC_STOREFRONT_ID`,
`PRIVATE_STOREFRONT_API_TOKEN`, and the Customer Account variables) for you when you create the
storefront. Don't copy them by hand.

## Local development

You don't need this to run your store. It's for developers who work on the storefront code.

Requires Node.js 22.12 or later.

```bash
npm install
cp .env.example .env
npm run dev
```

Without store credentials in `.env`, the storefront runs against `mock.shop`, Shopify's public
demo catalog, with the built-in theme. To use your real store, link the storefront and pull its
variables:

```bash
npx shopify hydrogen link       # once per checkout
npx shopify hydrogen env pull   # writes the storefront's variables to .env
npm run dev
```

With a real store, also set `HCMS_API_URL`, `HCMS_PREVIEW_SECRET` and `HCMS_PUBLIC_KEY` in `.env`
(same values as Production). Without them you see the HydrogenCMS setup screen instead of the
store.

Customer accounts need trusted local HTTPS: run `npm run dev:https` and open
<https://local.tryhydrogen.dev:5173>.

| Command | Does |
| --- | --- |
| `npm run dev` | Start the local server. |
| `npm run dev:https` | Start the local server with trusted HTTPS (customer accounts). |
| `npm run build` | Production build for Oxygen. |
| `npm run preview` | Build, then run the production build locally. |
| `npm run typecheck` | Type checks and Storefront API query checks. |
| `npm test` | Unit tests. |

Optional variables are described in `.env.example`. `HCMS_INSTALL_URL` changes where the setup
screen's **Install HydrogenCMS** button points.

## Update the storefront

New sections, blocks and fixes ship as new versions of this template. The HydrogenCMS packages
are in `vendor/` and pinned in `package.json`; keep those versions as they are, because each
release is tested against exact versions.

To take an update:

1. Copy `vendor/`, `package.json` and `package-lock.json` from the latest template into your
   repository (or merge the template repository into yours if you track it as a git remote).
   Keep your own files in `app/sections/custom/`.
2. Run `npm install`, `npm run build` and `npm test` locally if you have changed code.
3. Commit and push. Shopify deploys the new version to Oxygen.
4. When the deployment finishes, open HydrogenCMS › **Settings** and select **Sync** on the
   **Sections** card. The theme editor then shows the new sections.

Your published theme stays live while you update, and you can roll back from **Version history**
in HydrogenCMS at any time.

## Custom sections

Developers can add their own sections and blocks to the theme editor. Create
`app/sections/custom/` and put one file per section in it; working examples are in `app/sections/examples/`. After you deploy, select
**Sync** in HydrogenCMS and the new sections show up under **Add section**.

The full guide: [Build your own sections and blocks](./docs/developers/custom-sections.md).

## Troubleshooting

**Every page shows "This storefront runs on HydrogenCMS".** The HydrogenCMS variables are missing
from this deployment. Add the variables the screen lists to **Production** (not Preview), then
redeploy. Adding variables doesn't change a running deployment.

**Check connection fails.** Read what's listed under **To fix** in the Setup guide. Confirm all
three variables are in Production and that you redeployed. Make sure the Production URL opens in
your browser. If the environment is private, use **Verify in a new tab**, then **Refresh**.

**It worked, then stopped after resetting keys.** **Settings › Developers › Reset storefront keys**
creates new values. Update the variables in Shopify and redeploy.

**My changes aren't showing.** Saving doesn't publish. Select **Publish** in the theme editor,
then hard-refresh the storefront. **Version history** shows which version is live.

**New sections are missing from the editor.** Wait for the deployment to finish, then select
**Sync** in HydrogenCMS › Settings › Sections.

**The preview is blank in the editor.** Open the preview in a new tab to see whether the
storefront loads on its own, then run **Check connection** again. If your storefront can't be shown
inside the editor, add an Oxygen shareable link in HydrogenCMS › Settings.

**HydrogenCMS is down.** Your storefront keeps working. It serves the last published theme from
your store's own data, and if that isn't available, the built-in theme. Publishing resumes when
HydrogenCMS is back.

For more help, open **Help** in the HydrogenCMS app.

## License

Based on Shopify's Hydrogen template, which is MIT licensed. See [LICENSE](./LICENSE).
