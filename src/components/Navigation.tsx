'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavigationProps {
    userEmail?: string;
    onLogout: () => void;
}

export default function Navigation({ userEmail, onLogout }: NavigationProps) {
    const pathname = usePathname();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    
    const navItems = [
        { 
            href: `${basePath}/pages`, 
            label: 'Pages',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            )
        },
        { 
            href: `${basePath}/cms`, 
            label: 'CMS',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
            )
        },
    ];

    return (
        <nav className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo and Nav Links */}
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
                            </div>
                            <span className="font-semibold text-zinc-900 dark:text-zinc-50 hidden sm:block">
                                Translation Orchestrator
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                            {navItems.map((item) => {
                                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                            isActive
                                                ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900'
                                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-50'
                                        }`}
                                    >
                                        {item.icon}
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* User Menu */}
                    <div className="flex items-center gap-4">
                        {userEmail && (
                            <div className="text-right hidden sm:block">
                                <div className="text-xs text-zinc-500 dark:text-zinc-500">Signed in as</div>
                                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate max-w-[200px]">
                                    {userEmail}
                                </div>
                            </div>
                        )}
                        <button
                            onClick={onLogout}
                            className="px-4 py-2 bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors text-sm font-medium"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}

