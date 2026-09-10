import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/LoginForm';

export const metadata: Metadata = { title: 'ログイン | Bookshelf' };

export default function LoginPage() {
  return <LoginForm />;
}
