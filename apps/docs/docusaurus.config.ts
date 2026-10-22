import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const appUrl = 'https://app.seidar.xyz';

const config: Config = {
  title: 'Seidar Docs',
  tagline: 'Stellar DeFi, all in one place',
  favicon: 'img/favicon.svg',

  url: 'https://docs.seidar.xyz',
  baseUrl: '/',

  organizationName: 'seidar',
  projectName: 'seidar',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  customFields: {
    appUrl,
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          breadcrumbs: true,
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Seidar',
      logo: {
        alt: 'Seidar',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/getting-started',
          label: 'Getting Started',
          position: 'left',
        },
        {
          href: appUrl,
          label: 'Launch App',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {label: 'Introduction', to: '/'},
            {label: 'Getting Started', to: '/getting-started'},
          ],
        },
        {
          title: 'Product',
          items: [
            {label: 'Portfolio Dashboard', to: '/features/dashboard'},
            {label: 'Swap', to: '/features/trading/swap'},
            {label: 'Earn', to: '/features/earn/overview'},
          ],
        },
        {
          title: 'Seidar',
          items: [{label: 'Launch App', href: appUrl}],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Seidar. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.dracula,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

