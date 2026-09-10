export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        BookshelfSystem
      </h1>
      <p className="max-w-md text-sm text-wood-100 sm:text-base">
        購入済み書籍の管理と発売日カレンダーを備えた本棚アプリケーションです。
      </p>
      <p className="text-xs text-wood-200">
        基盤構築が完了しました。認証・本棚UI・カレンダーは後続の実装で追加されます。
      </p>
    </div>
  );
}
