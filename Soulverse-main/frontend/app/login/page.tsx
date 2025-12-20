'use client';
import LoginPage from '@/components/LoginPage';
import { useRouter } from 'next/navigation';

export default function Page() {
    const router = useRouter();
    const handleLoginSuccess = (user: any) => {
        router.push('/universe');
    };
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
}
