import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'index',
    'getting-started',
    {
      type: 'category',
      label: 'Features',
      collapsed: false,
      items: [
        'features/dashboard',
        'features/wallets',
        {
          type: 'category',
          label: 'Trading',
          collapsed: false,
          items: ['features/trading/swap', 'features/trading/perps'],
        },
        {
          type: 'category',
          label: 'Earn',
          collapsed: false,
          items: [
            'features/earn/overview',
            'features/earn/lending-borrowing',
            'features/earn/liquidity',
            'features/earn/vaults',
          ],
        },
        'features/bridge',
        'features/send-receive',
        'features/transactions',
      ],
    },
    'protocols',
    'security',
    'faq',
  ],
};

export default sidebars;
