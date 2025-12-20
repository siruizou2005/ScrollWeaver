'use client';
import UniverseView from '@/components/UniverseView';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';

export default function Page() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getCurrentUser().then(res => {
            if (res.success && res.user) {
                setUser(res.user);
            } else {
                router.push('/login');
            }
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="bg-black h-screen text-white flex items-center justify-center">Loading...</div>;
    if (!user) return null;

    return <UniverseView user={user} />;
}
