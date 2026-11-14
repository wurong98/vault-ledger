import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { api, ApiError } from '../api.js';
export function UnlockPage({ onDone }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post('/unlock', { password });
            onDone();
        }
        catch (err) {
            setError(err instanceof ApiError ? err.message : '解锁失败');
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { className: "card", children: [_jsx("h2", { children: "\u89E3\u9501\u8D26\u5323" }), _jsx("p", { className: "muted", children: "\u6570\u636E\u5728\u672C\u5730\u52A0\u5BC6\u4FDD\u5B58\uFF0C\u8F93\u5165\u5BC6\u7801\u540E\u624D\u80FD\u67E5\u770B\u3002" }), _jsx("label", { htmlFor: "unlock-password", children: "\u5BC6\u7801" }), _jsx("input", { id: "unlock-password", type: "password", value: password, autoComplete: "current-password", onChange: (e) => setPassword(e.target.value) }), error ? _jsx("p", { className: "error", children: error }) : null, _jsx("button", { className: "primary", onClick: () => void submit(), disabled: busy, children: busy ? '解锁中…' : '解锁' })] }));
}
//# sourceMappingURL=UnlockPage.js.map