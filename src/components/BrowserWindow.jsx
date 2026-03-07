import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Globe, X } from 'lucide-react';

const BrowserWindow = ({ imageSrc, logs, onClose, socket, onResize }) => {
    const [input, setInput] = useState('');
    const logsEndRef = useRef(null);
    const resizingRef = useRef(null);
    const startPosRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const handleResizeStart = useCallback((e, direction) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = direction;
        const parent = e.target.closest('[id="browser"]');
        startPosRef.current = {
            x: e.clientX,
            y: e.clientY,
            w: parent?.offsetWidth || 550,
            h: parent?.offsetHeight || 380
        };

        const handleResizeMove = (moveE) => {
            if (!resizingRef.current) return;
            const dx = moveE.clientX - startPosRef.current.x;
            const dy = moveE.clientY - startPosRef.current.y;
            const dir = resizingRef.current;
            let newW = startPosRef.current.w;
            let newH = startPosRef.current.h;
            if (dir.includes('e')) newW += dx;
            if (dir.includes('w')) newW -= dx;
            if (dir.includes('s')) newH += dy;
            if (dir.includes('n')) newH -= dy;
            newW = Math.max(300, newW);
            newH = Math.max(200, newH);
            if (onResize) onResize(newW, newH);
        };

        const handleResizeEnd = () => {
            resizingRef.current = null;
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeEnd);
        };

        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', handleResizeEnd);
    }, [onResize]);

    // Auto-scroll logs to bottom
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const handleSend = () => {
        if (!input.trim()) return;
        if (socket) {
            socket.emit('prompt_web_agent', { prompt: input });
            // Optionally add a local log
            // But usually backend sends logs back.
        }
        setInput('');
    };

    return (
        <div className="w-full h-full relative group bg-[#111] rounded-lg overflow-hidden flex flex-col border border-gray-800">
            {/* Header Bar - Drag Handle */}
            <div data-drag-handle className="h-8 bg-[#222] border-b border-gray-700 flex items-center justify-between px-2 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="flex items-center gap-2 text-gray-300 text-xs font-mono">
                    <Globe size={14} className="text-teal-400" />
                    <span>WEB_AGENT_VIEW</span>
                </div>
                <button onClick={onClose} className="hover:bg-red-500/20 text-gray-400 hover:text-red-400 p-1 rounded transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* Browser Content */}
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                {imageSrc ? (
                    <img
                        src={`data:image/jpeg;base64,${imageSrc}`}
                        alt="Browser View"
                        className="max-w-full max-h-full object-contain"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <div className="text-gray-600 text-xs font-mono animate-pulse">Waiting for browser stream...</div>
                    </div>
                )}
            </div>

            {/* Input Bar */}
            <div className="h-10 bg-[#161616] border-t border-gray-800 flex items-center px-2 gap-2">
                <span className="text-teal-400 font-mono text-xs">{'>'}</span>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Enter command for Web Agent..."
                    className="flex-1 bg-transparent border-none outline-none text-gray-300 text-xs font-mono placeholder-gray-600"
                />
            </div>

            {/* Logs Overlay (Bottom) */}
            <div className="h-24 bg-black/90 backdrop-blur border-t border-gray-800 p-2 font-mono text-[10px] overflow-y-auto text-green-500/80">
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 border-l-2 border-white/10 pl-1 break-words">
                        <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                        {log}
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>

            {/* Resize Handles */}
            <div onMouseDown={(e) => handleResizeStart(e, 'e')} className="absolute top-0 right-0 w-1.5 h-full cursor-e-resize hover:bg-teal-400/20 transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 's')} className="absolute bottom-0 left-0 w-full h-1.5 cursor-s-resize hover:bg-teal-400/20 transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 'w')} className="absolute top-0 left-0 w-1.5 h-full cursor-w-resize hover:bg-teal-400/20 transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 'n')} className="absolute top-0 left-0 w-full h-1.5 cursor-n-resize hover:bg-teal-400/20 transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize hover:bg-teal-400/30 rounded-tl transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 'sw')} className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize hover:bg-teal-400/30 rounded-tr transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 'ne')} className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize hover:bg-teal-400/30 rounded-bl transition-colors" />
            <div onMouseDown={(e) => handleResizeStart(e, 'nw')} className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize hover:bg-teal-400/30 rounded-br transition-colors" />
        </div>
    );
};

export default BrowserWindow;
