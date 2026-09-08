/**
 * スタイルシートの副作用インポート用アンビエント宣言。
 *
 * Next.js 15 は CSS の型宣言を同梱しておらず、TypeScript 6 以降は
 * 型情報のない副作用インポートを TS2882 として報告するため、ここで補う。
 */
declare module '*.css';
declare module '*.scss';
