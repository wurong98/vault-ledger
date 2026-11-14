import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiError } from './api.js';
import { SetupPage } from './pages/SetupPage.js';
import { UnlockPage } from './pages/UnlockPage.js';
import { HomePage } from './pages/HomePage.js';
import { CapturePage } from './pages/CapturePage.js';
import { RecordsPage } from './pages/RecordsPage.js';
import { RecordPage } from './pages/RecordPage.js';
import { QueryPage } from './pages/QueryPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
const LEDGER_KEY = 'ledgerbox.currentLedger';
export function App() {
    const [status, setStatus] = useState(null);
    const [ledgers, setLedgers] = useState([]);
    const [ledgerId, setLedgerId] = useState(() => localStorage.getItem(LEDGER_KEY));
    const [error, setError] = useState(null);
    const refresh = useCallback(async () => {
        try {
            const next = await api.get('/status');
            setStatus(next);
            setError(null);
            if (!next.locked && next.setupState !== 'uninitialized') {
                const data = await api.get('/ledgers');
                setLedgers(data.ledgers);
                setLedgerId((current) => {
                    if (current && data.ledgers.some((l) => l.id === current))
                        return current;
                    const fallback = data.ledgers[0]?.id ?? null;
                    if (fallback)
                        localStorage.setItem(LEDGER_KEY, fallback);
                    return fallback;
                });
            }
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '无法连接服务');
        }
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const currentLedger = useMemo(() => ledgers.find((l) => l.id === ledgerId) ?? null, [ledgers, ledgerId]);
    const switchLedger = (id) => {
        localStorage.setItem(LEDGER_KEY, id);
        setLedgerId(id);
    };
    if (!status) {
        return (_jsx("div", { className: "app", children: _jsxs("div", { className: "card", children: [_jsx("p", { className: "muted", children: "\u6B63\u5728\u8FDE\u63A5 LedgerBox\u2026" }), error ? _jsx("p", { className: "error", children: error }) : null] }) }));
    }
    if (status.setupState === 'uninitialized') {
        return (_jsx("div", { className: "app", children: _jsx(SetupPage, { onDone: () => void refresh() }) }));
    }
    if (status.locked) {
        return (_jsx("div", { className: "app", children: _jsx(UnlockPage, { onDone: () => void refresh() }) }));
    }
    return (_jsxs("div", { className: "app", children: [_jsxs("header", { className: "topbar", children: [_jsx("h1", { children: "LedgerBox \u8D26\u5323" }), _jsx("div", { className: "spacer" }), _jsx("select", { value: ledgerId ?? '', onChange: (event) => switchLedger(event.target.value), style: { width: 'auto', marginBottom: 0 }, "aria-label": "\u5207\u6362\u8D26\u672C", children: ledgers.map((ledger) => (_jsx("option", { value: ledger.id, children: ledger.name }, ledger.id))) })] }), !status.llmConfigured ? (_jsx("div", { className: "card", children: _jsx("p", { className: "muted", children: "\u5C1A\u672A\u914D\u7F6E\u6A21\u578B API Key\uFF1A\u53EF\u4EE5\u624B\u52A8\u8BB0\u8D26\uFF0C\u4F46\u8BC6\u522B\u4E0E AI \u67E5\u8BE2\u4E0D\u53EF\u7528\u3002" }) })) : null, _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomePage, { ledger: currentLedger, onRefresh: refresh }) }), _jsx(Route, { path: "/capture", element: _jsx(CapturePage, { ledger: currentLedger }) }), _jsx(Route, { path: "/records", element: _jsx(RecordsPage, { ledger: currentLedger }) }), _jsx(Route, { path: "/records/:id", element: _jsx(RecordPage, { ledger: currentLedger }) }), _jsx(Route, { path: "/query", element: _jsx(QueryPage, { ledger: currentLedger }) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsPage, { status: status, onRefresh: refresh }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }), _jsxs("nav", { className: "nav", children: [_jsx(NavLink, { to: "/", end: true, children: ({ isActive }) => (_jsx("button", { className: isActive ? 'active' : '', children: "\u9996\u9875" })) }), _jsx(NavLink, { to: "/capture", children: ({ isActive }) => (_jsx("button", { className: isActive ? 'active' : '', children: "\u5F55\u5165" })) }), _jsx(NavLink, { to: "/records", children: ({ isActive }) => (_jsx("button", { className: isActive ? 'active' : '', children: "\u6D41\u6C34" })) }), _jsx(NavLink, { to: "/query", children: ({ isActive }) => (_jsx("button", { className: isActive ? 'active' : '', children: "\u67E5\u8BE2" })) }), _jsx(NavLink, { to: "/settings", children: ({ isActive }) => (_jsx("button", { className: isActive ? 'active' : '', children: "\u8BBE\u7F6E" })) })] })] }));
}
//# sourceMappingURL=App.js.map