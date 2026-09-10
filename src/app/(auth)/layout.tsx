import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-wood-900 bg-wood-grain p-4">
      <div className="w-full max-w-md rounded-lg bg-wood-50 p-8 shadow-book">
        <h1 className="mb-6 text-center text-2xl font-bold text-wood-800">
          Bookshelf
        </h1>
        {children}
      </div>
    </main>
  );
}
