import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // 木製本棚UIの質感表現に用いるベースカラー
        wood: {
          50: '#f6ecdd',
          100: '#e8d3b4',
          200: '#d6b487',
          300: '#c0925f',
          400: '#a97544',
          500: '#8b5a2b',
          600: '#6f4522',
          700: '#54331a',
          800: '#3a2312',
          900: '#24150a',
        },
      },
      boxShadow: {
        // 棚板の立体感（内側の影）
        shelf: 'inset 0 -8px 12px -6px rgba(0,0,0,0.55), inset 0 4px 6px -4px rgba(255,255,255,0.18)',
        book: '2px 2px 6px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        // 木目テクスチャ（外部画像に依存しないCSSグラデーション）
        'wood-grain':
          'repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 6px)',
      },
    },
  },
  plugins: [],
};

export default config;
