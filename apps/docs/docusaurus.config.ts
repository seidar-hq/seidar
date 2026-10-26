import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const appUrl = 'https://app.seidar.xyz';
const siteUrl = 'https://seidar.xyz';

const config: Config = {
  title: 'Seidar Docs',
  tagline: 'Stellar DeFi, all in one place',
  favicon: 'img/favicon.svg',

  url: 'https://docs.seidar.xyz',
  baseUrl: '/',
  trailingSlash: false,

  organizationName: 'seidar-hq',
  projectName: 'seidar',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  customFields: {
    appUrl,
  },

  headTags: [
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'}},
  ],
  stylesheets: ['https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap'],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          breadcrumbs: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
        sitemap: {
          changefreq: 'weekly',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/logo.svg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: {
        hideable: false,
        autoCollapseCategories: false,
      },
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
    },
    navbar: {
      title: 'Seidar',
      logo: {
        alt: 'Seidar',
        src: 'img/logo.svg',
        href: '/',
      },
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Documentation'},
        {to: '/getting-started', label: 'Getting Started', position: 'left'},
        {to: '/faq', label: 'FAQ', position: 'left'},
        {href: appUrl, label: 'Launch App', position: 'right', className: 'navbar-launch'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/'},
            {label: 'Getting Started', to: '/getting-started'},
            {label: 'FAQ', to: '/faq'},
          ],
        },
        {
          title: 'Product',
          items: [
            {label: 'Dashboard', to: '/features/dashboard'},
            {label: 'Swap', to: '/features/trading/swap'},
            {label: 'Earn', to: '/features/earn/overview'},
            {label: 'Bridge', to: '/features/bridge'},
          ],
        },
        {
          title: 'Seidar',
          items: [
            {label: 'Launch App', href: appUrl},
            {label: 'Website', href: siteUrl},
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Seidar. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
