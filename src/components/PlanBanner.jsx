import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Crown, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import { getUserPlan, getUserEmail } from '../utils/auth';

const PLAN_CONFIG = {
    free: {
        label: 'Free',
        color: 'gray',
        icon: Zap,
        dailyMinutes: 30,
        gradient: 'from-gray-500 to-gray-400',
        border: 'border-white/10',
        bg: 'bg-white/5',
        glow: '',
    },
    pro: {
        label: 'Pro',
        color: 'teal',
        icon: Zap,
        dailyMinutes: null,
        gradient: 'from-teal-400 to-cyan-400',
        border: 'border-teal-500/30',
        bg: 'bg-teal-500/10',
        glow: 'shadow-[0_0_20px_rgba(94,234,212,0.1)]',
    },
    business: {
        label: 'Business',
        color: 'violet',
        icon: Crown,
        dailyMinutes: null,
        gradient: 'from-violet-400 to-purple-400',
        border: 'border-violet-500/30',
        bg: 'bg-violet-500/10',
        glow: 'shadow-[0_0_20px_rgba(139,92,246,0.1)]',
    },
};

const CHECKOUT_BASE = import.meta.env.VITE_CLOUD_API_URL || 'https://dvirius-m7f7.vercel.app';

const PlanBanner = ({ plan = 'free', usage = {}, features = null, onUpgrade }) => {
    const [expanded, setExpanded] = useState(false);
    const config = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
    const Icon = config.icon;

    const minutesUsed = usage.minutes_used_today || 0;
    const dailyLimit = config.dailyMinutes;
    const minutesRemaining = dailyLimit ? Math.max(0, dailyLimit - minutesUsed) : null;
    const usagePercent = dailyLimit ? Math.min(100, (minutesUsed / dailyLimit) * 100) : 0;

    const handleUpgrade = () => {
        if (onUpgrade) {
            onUpgrade();
        } else {
            const { shell } = window.require('electron');
            shell.openExternal(`${CHECKOUT_BASE}/billing/create-checkout?plan=pro&billing=monthly`);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`fixed bottom-4 left-4 z-50 pointer-events-auto`}
        >
            <div
                className={`backdrop-blur-2xl ${config.bg} ${config.border} border rounded-2xl ${config.glow} transition-all duration-300 overflow-hidden`}
                style={{ minWidth: expanded ? 280 : 'auto' }}
            >
                {/* Compact View */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-2.5 px-3.5 py-2 w-full text-left hover:bg-white/5 transition-colors"
                >
                    <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
                        <Icon size={13} className="text-white" />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>
                            {config.label}
                        </span>

                        {dailyLimit && (
                            <>
                                <span className="text-[10px] text-gray-600">|</span>
                                <span className={`text-[10px] ${minutesRemaining <= 5 ? 'text-red-400' : 'text-gray-400'}`}>
                                    {Math.round(minutesUsed)}/{dailyLimit}m
                                </span>
                            </>
                        )}

                        {!dailyLimit && (
                            <>
                                <span className="text-[10px] text-gray-600">|</span>
                                <span className="text-[10px] text-gray-400">Unlimited</span>
                            </>
                        )}
                    </div>

                    {expanded ? (
                        <ChevronDown size={12} className="text-gray-500 ml-auto" />
                    ) : (
                        <ChevronUp size={12} className="text-gray-500 ml-auto" />
                    )}
                </button>

                {/* Usage Bar (Free plan only) */}
                {dailyLimit && (
                    <div className="px-3.5 pb-1">
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className={`h-full rounded-full ${usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-yellow-500' : 'bg-teal-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${usagePercent}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                        </div>
                    </div>
                )}

                {/* Expanded Details */}
                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="px-3.5 pb-3 pt-1.5 space-y-2.5">
                                {/* Usage Stats */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-gray-500">Voice minutes</span>
                                        <span className="text-gray-300">
                                            {dailyLimit ? `${Math.round(minutesUsed)} / ${dailyLimit} min` : 'Unlimited'}
                                        </span>
                                    </div>
                                    {features && (
                                        <>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-gray-500">CAD generation</span>
                                                <span className={features.cad_generation ? 'text-teal-400' : 'text-gray-600'}>
                                                    {features.cad_generation ? 'Enabled' : 'Pro only'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-gray-500">Web agent</span>
                                                <span className={features.web_agent ? 'text-teal-400' : 'text-gray-600'}>
                                                    {features.web_agent ? 'Enabled' : 'Pro only'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-gray-500">Smart home</span>
                                                <span className={features.smart_home ? 'text-teal-400' : 'text-gray-600'}>
                                                    {features.smart_home ? 'Enabled' : 'Pro only'}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Upgrade Button (Free plan only) */}
                                {plan === 'free' && (
                                    <button
                                        onClick={handleUpgrade}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold bg-gradient-to-r from-teal-500 to-violet-500 text-white hover:from-teal-400 hover:to-violet-400 hover:shadow-[0_0_20px_rgba(94,234,212,0.2)] transition-all"
                                    >
                                        <Zap size={12} />
                                        Upgrade to Pro — $20/mo
                                    </button>
                                )}

                                {/* Manage Subscription (paid plans) */}
                                {plan !== 'free' && (
                                    <button
                                        onClick={() => {
                                            const { shell } = window.require('electron');
                                            shell.openExternal(`${CHECKOUT_BASE}/billing/portal`);
                                        }}
                                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] text-gray-400 hover:text-gray-300 hover:bg-white/5 transition-all"
                                    >
                                        Manage subscription
                                        <ExternalLink size={10} />
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default PlanBanner;
